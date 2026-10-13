import { useState } from 'react'
import { deleteLetter, updateLetter } from '../../api/letters'
import { reencryptLetter } from '../../crypto'
import { describeReplyError } from '../../letters/record'
import type { Message } from '../../types'

// Correcting a recorded reply, on the thread page for group admins (README
// "Letter lifecycle": replies stay editable by whoever can see them; "PUT
// /messaging/message": a group that only mails a letter may still correct a
// reply it recorded). Editing the transcription sends new ciphertext and nonce
// under the reply's own content key, so every envelope it has still opens it
// ("Sending and reading letters"). Deleting takes its scans with it.

export default function CorrectReply({
  message,
  text,
  contentKey,
  onChanged,
}: {
  message: Message
  /** The transcription as it reads now; empty for a scan alone. */
  text: string
  /** The reply's content key, opened from the group's envelope; null when this reader couldn't open it (then only Delete). */
  contentKey: Uint8Array | null
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!contentKey) return
    setBusy(true)
    setError(null)
    try {
      await updateLetter(message.id, await reencryptLetter(draft, contentKey))
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(describeReplyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteLetter(message.id)
      onChanged()
    } catch (err) {
      setError(describeReplyError(err))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="letter-body-after">
      {editing && (
        <>
          <textarea
            className="reply-textarea"
            aria-label="Corrected transcription"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="reply-correct-actions is-editing">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || draft === text} onClick={save}>
              {busy ? 'Saving…' : 'Save the transcription'}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => {
                setEditing(false)
                setDraft(text)
              }}
            >
              Cancel
            </button>
          </p>
        </>
      )}
      {confirming && (
        <p className="letter-body-scan-note">
          Delete this reply{message.attachments?.length ? ' and its scans' : ''}? The writer won't see it any more, and it can't
          be brought back.{' '}
          <button type="button" className="btn btn-sm" disabled={busy} onClick={remove}>
            {busy ? 'Deleting…' : 'Yes, delete it'}
          </button>{' '}
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </p>
      )}
      {!editing && !confirming && (
        <p className="reply-correct-actions">
          {contentKey && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setDraft(text)
                setEditing(true)
              }}
            >
              Edit transcription
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </p>
      )}
      {error && (
        <p className="letter-body-scan-note is-error">
          {error}
        </p>
      )}
    </div>
  )
}
