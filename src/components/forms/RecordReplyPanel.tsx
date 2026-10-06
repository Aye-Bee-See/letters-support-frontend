import { useEffect, useRef, useState } from 'react'
import { getUserPublicKey } from '../../api/letters'
import { toApiError } from '../../api/client'
import { forgetContentKey } from '../../crypto'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { recordReply, replyHasContent } from '../../letters/record'
import { AttachmentNotUploaded, newIdempotencyKey, uploadLetterFile } from '../../letters/send'
import type { Message } from '../../types'
import { describeReferenceError, formatReference } from '../../utils/replyReference'
import AttachmentRetry from './AttachmentRetry'
import UploadZone from './UploadZone'

// Recording a prisoner's reply (README "Reply reference": filing a reply), in
// the reply panel's markup (pages/thread.css). The writer and the prisoner are
// settled before this panel shows: by a reply reference or a name search on
// /replies/new, or by the thread it sits under. The transcription and the scan
// are encrypted in this browser (src/letters/record.ts).

/** What to tell the group admin about a failed request. */
function describe(err: unknown): string {
  const e = toApiError(err)
  const reference = describeReferenceError(e)
  if (reference) return reference
  return e.errors.length ? e.errors.join(' ') : e.status ? e.message : err instanceof Error ? err.message : 'Something went wrong.'
}

/** A reply that was filed without its file: what retrying the file needs. The content key stays in memory only. */
interface FileToRetry {
  letter: Message
  file: File
  contentKey: Uint8Array
  idempotencyKey: string
}

export interface RecordedReply {
  message: Message
  /** False when the writer had no keys: the reply is sealed to the group alone for now. */
  sealedToWriter: boolean
}

export default function RecordReplyPanel({
  writer,
  prisoner,
  reference,
  onRecorded,
}: {
  /** Whose thread the reply goes in. */
  writer: { id: number; name: string }
  /** Who wrote it. */
  prisoner: { id: number; name: string }
  /** The reply reference it was found by; without one it is filed by writer and prisoner. */
  reference?: string | null
  onRecorded: (reply: RecordedReply) => void
}) {
  const { user, groupKeypair } = useAuth()
  // Null until they set up keys; then the reply is sealed to them as well (README "Account keys").
  const writerKey = useApi(() => getUserPublicKey(writer.id), [writer.id])
  const writerHasKey = writerKey.data ? writerKey.data.publicKey !== null : null

  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // One key per reply, kept across retries; a new one after it is recorded.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retryRef = useRef<FileToRetry | null>(null)
  const [attachmentFailed, setAttachmentFailed] = useState<{ fileName: string; error: string } | null>(null)
  // The content key of a reply whose file is waiting for a retry is forgotten
  // exactly once: on leaving the page (unless a retry is under way, which then
  // forgets it), or when the retry or "continue without it" finishes.
  const mountedRef = useRef(false)
  const retryingRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (retryRef.current && !retryingRef.current) {
        void forgetContentKey(retryRef.current.contentKey)
        retryRef.current = null
      }
    }
  }, [])

  const chapterId = user?.chapterId ?? null
  const canRecord = Boolean(chapterId && groupKeypair && replyHasContent({ text, file })) && !recording && !attachmentFailed

  function clear() {
    setText('')
    setFile(null)
    setIdempotencyKey(newIdempotencyKey())
  }

  async function onRecord() {
    if (!canRecord || !chapterId || !groupKeypair) return
    setRecording(true)
    setError(null)
    try {
      const reply = await recordReply(
        { reference, writerId: writer.id, prisonerId: reference ? null : prisoner.id, text, file, idempotencyKey },
        { chapterId, keypair: groupKeypair },
      )
      clear()
      onRecorded(reply)
    } catch (err) {
      if (err instanceof AttachmentNotUploaded && !mountedRef.current) {
        await forgetContentKey(err.contentKey)
      } else if (err instanceof AttachmentNotUploaded && file) {
        // The reply is filed: only the file is left to retry, with the reply's own key.
        retryRef.current = { letter: err.letter, file, contentKey: err.contentKey, idempotencyKey }
        setAttachmentFailed({ fileName: file.name, error: describe(err.cause) })
      } else {
        setError(describe(err))
      }
    } finally {
      setRecording(false)
    }
  }

  /** Done with a reply whose file failed: forget its key and go on. */
  function finishAttachment() {
    const pending = retryRef.current
    if (!pending) return
    retryRef.current = null
    void forgetContentKey(pending.contentKey)
    setAttachmentFailed(null)
    clear()
    if (mountedRef.current) onRecorded({ message: pending.letter, sealedToWriter: writerHasKey ?? false })
  }

  async function retryAttachment() {
    const pending = retryRef.current
    if (!pending || retryingRef.current) return
    retryingRef.current = true
    setRecording(true)
    try {
      await uploadLetterFile(pending.letter, pending.file, pending.contentKey, pending.idempotencyKey)
      finishAttachment()
    } catch (err) {
      setAttachmentFailed({ fileName: pending.file.name, error: describe(err) })
    } finally {
      retryingRef.current = false
      setRecording(false)
      // The page went while the retry was under way: its cleanup left the key to this.
      if (!mountedRef.current && retryRef.current) {
        void forgetContentKey(retryRef.current.contentKey)
        retryRef.current = null
      }
    }
  }

  if (!chapterId || !groupKeypair) {
    return (
      <div className="reply-panel">
        <div className="reply-panel-body">
          <p className="reply-notes-hint">
            Recording a reply needs your group's key, and you don't hold it in this session. Once a group admin who holds
            it hands it to you, replies can be recorded here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="reply-panel">
      <div className="reply-panel-header">
        <span className="reply-panel-title">Record a reply</span>
        <UploadZone variant="reply" file={file} onFile={setFile} label="Add a scan or photo" />
      </div>

      <div className="reply-panel-body">
        <p className="reply-notes-hint" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
          From <strong>{prisoner.name}</strong> to <strong>{writer.name}</strong>
          {reference ? ` · reference ${formatReference(reference)}` : ''}
        </p>
        <textarea
          className="reply-textarea"
          aria-label="Transcription of the reply"
          placeholder="Type what the prisoner wrote, or leave this empty and add a scan or photo of the reply."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {writerHasKey === false && (
          <p className="reply-notes-hint">
            {writer.name} hasn't set up their keys yet, so this reply is sealed to your group only. They will be able to read
            it once they set up their keys and a group admin of your group signs in, which shares it with them.
          </p>
        )}
        {attachmentFailed && (
          <AttachmentRetry
            what="reply"
            fileName={attachmentFailed.fileName}
            error={attachmentFailed.error}
            busy={recording}
            onRetry={retryAttachment}
            onSkip={finishAttachment}
          />
        )}
        {error && (
          <p className="reply-notes-hint" style={{ color: 'var(--alert)' }}>
            <strong>Not recorded.</strong> {error}
          </p>
        )}
      </div>

      <div className="reply-panel-footer">
        <span className="reply-submit-note">
          <strong>Goes into {writer.name}'s conversation with {prisoner.name}.</strong>{' '}
          {writerHasKey === false ? 'Only your group can read it for now.' : `Only ${writer.name} and your group can read it.`}
        </span>
        <button type="button" className="reply-submit-btn" disabled={!canRecord} onClick={onRecord}>
          {recording ? 'Recording…' : 'Record reply'}
        </button>
      </div>
    </div>
  )
}
