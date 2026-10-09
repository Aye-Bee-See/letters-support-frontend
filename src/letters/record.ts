import { toApiError } from '../api/client'
import { getGroupPublicKey, getUserPublicKey } from '../api/letters'
import type { Keypair, Reader } from '../crypto'
import type { Message } from '../types'
import { describeReferenceError, normalizeReference } from '../utils/replyReference'
import { sealAndSend, type Replay } from './send'

// Recording a prisoner's reply (README "Reply reference": filing a reply;
// "Message fields": sender prisoner, reference; "End-to-end mode: Sending and
// reading letters"). A group admin types what the prisoner wrote, or scans or
// photographs it, and files it in the writer's thread. Like a letter, it gets a
// fresh content key, sealed to the writer (when they have keys) and to the
// group; the scan is encrypted with the same key. The API marks it `received`.
//
// A writer who has no keys yet still gets the reply: it is sealed to the group
// alone, the writer sees it waiting (`envelopes: []`), and a group admin's
// client adds their envelope once they set up keys (GET /messaging/envelopes/missing).

export interface ReplyDraft {
  /**
   * The reply reference copied from the top of the reply (4827-1935-8, dashes
   * optional). The API fills in the writer, the prisoner and the letter it
   * answers from it. Leave it out for a reply filed by name.
   */
  reference?: string | null
  /** Whose thread it goes in: from the reference lookup, the name search, or the thread. Sealed to when they have keys. */
  writerId: number
  /**
   * The writer's public key when it is already known: the reference lookup
   * gives it (README "Reply reference": `writer.publicKey`), and so does a
   * thread's `user_details`. Null for a writer without keys. Left out (the name
   * search gives no key), it is fetched from GET /auth/public-key.
   */
  writerPublicKey?: string | null
  /** Who wrote it. Sent only for a reply filed by name; with a reference the number says. */
  prisonerId?: number | null
  /** The transcription; an empty string when there is only a scan or photo. */
  text: string
  /** A scan or photo of the reply. */
  file: File | null
  /** Made once per reply and reused on every retry, so it is never filed twice. */
  idempotencyKey: string
}

/** The group recording it: the signed-in admin's group and its key, open in this session. */
export interface RecordingGroup {
  chapterId: number
  keypair: Keypair
}

/** What to tell a group admin about a reply that couldn't be recorded, corrected or deleted. */
export function describeReplyError(err: unknown): string {
  const e = toApiError(err)
  const reference = describeReferenceError(e)
  if (reference) return reference
  return e.errors.length ? e.errors.join(' ') : e.status ? e.message : err instanceof Error ? err.message : 'Something went wrong.'
}

/** A reply can be recorded when it has something in it: a transcription, a file, or both. */
export const replyHasContent = (d: Pick<ReplyDraft, 'text' | 'file'>) => d.text.trim() !== '' || d.file !== null

/**
 * Record a prisoner's reply. Returns the stored reply (its `chat` is the
 * thread), whether it was sealed to the writer too, and `replay` when a retry
 * got back the reply an earlier attempt filed. Throws AttachmentNotUploaded
 * (src/letters/send.ts) if the reply was filed but its file didn't upload;
 * retry the file with uploadLetterFile. ReplayedFileRefused if an earlier
 * attempt filed it and this session can't open it to add the file.
 */
export async function recordReply(
  draft: ReplyDraft,
  group: RecordingGroup,
): Promise<{ message: Message; sealedToWriter: boolean; replay: Replay | null }> {
  if (!replyHasContent(draft)) throw new Error('Type the reply, or add a scan or photo of it.')
  const reference = draft.reference ? normalizeReference(draft.reference) : null
  if (!reference && !draft.prisonerId) throw new Error('Choose who the reply is from.')
  let sealedToWriter = false
  const { message, replay } = await sealAndSend(
    {
      // A scan alone still carries the encryption of an empty body: its content key encrypts the file.
      text: draft.text.trim() === '' ? '' : draft.text,
      readers: async () => {
        const known = draft.writerPublicKey
        const [writerKey, own] = await Promise.all([
          known !== undefined ? known : getUserPublicKey(draft.writerId).then((w) => w.publicKey),
          getGroupPublicKey(group.chapterId),
        ])
        if (!own.publicKey) throw new Error('Your group has no group key yet, so nothing can be recorded.')
        const readers: Reader[] = [{ readerType: 'chapter', readerId: group.chapterId, publicKey: own.publicKey, keyVersion: own.keyVersion }]
        // The writer must have an envelope once they have a public key; before that one would be refused.
        if (writerKey) readers.unshift({ readerType: 'user', readerId: draft.writerId, publicKey: writerKey })
        sealedToWriter = writerKey !== null
        return readers
      },
      body: reference ? { sender: 'prisoner', reference } : { sender: 'prisoner', user: draft.writerId, prisoner: draft.prisonerId },
      idempotencyKey: draft.idempotencyKey,
      self: { readerType: 'chapter', readerId: group.chapterId, keypair: group.keypair },
    },
    draft.file,
  )
  return { message, sealedToWriter, replay }
}
