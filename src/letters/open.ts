import { downloadAttachment } from '../api/letters'
import { decryptFile, decryptLetter, openEnvelope, type Keypair } from '../crypto'
import type { Attachment, Envelope, Message } from '../types'

// Opening letters (README "End-to-end mode: Sending and reading letters").
// Each letter has its own content key, sealed in an envelope to each reader.
// The API returns only the envelopes the caller can open: a writer gets their
// own; a group member gets the group's. The content key opens the body, the
// relay note and any attachments.

/** Who is reading: the signed-in account's keys, and its group's when it holds them. */
export interface LetterReader {
  userId: number
  keypair: Keypair
  chapterId?: number | null
  groupKeypair?: Keypair | null
}

export type OpenedLetter =
  /** Opened. `text` is null for a letter with no typed body (a paper letter, or a scan). */
  | { state: 'open'; text: string | null; relayNote: string | null; contentKey: Uint8Array }
  /** No envelope for this reader yet: e.g. a reply recorded before the writer had keys; the group shares it on its next sign-in. */
  | { state: 'waiting' }
  /** An envelope exists but would not open, or the body would not decrypt. */
  | { state: 'unreadable' }

/** The envelope this reader can open, and the keypair that opens it. */
function envelopeFor(envelopes: Envelope[], reader: LetterReader): { envelope: Envelope; keypair: Keypair } | null {
  const mine = envelopes.find((e) => e.readerType === 'user' && e.readerId === reader.userId)
  if (mine) return { envelope: mine, keypair: reader.keypair }
  if (reader.groupKeypair && reader.chapterId != null) {
    const group = envelopes.find((e) => e.readerType === 'chapter' && e.readerId === reader.chapterId)
    if (group) return { envelope: group, keypair: reader.groupKeypair }
  }
  return null
}

/** Open one letter's envelope and decrypt its body and relay note. Never throws. */
export async function openLetter(message: Message, reader: LetterReader): Promise<OpenedLetter> {
  const found = envelopeFor(message.envelopes ?? [], reader)
  if (!found) return { state: 'waiting' }
  try {
    const contentKey = await openEnvelope(found.envelope, found.keypair)
    if (!message.ciphertext || !message.nonce) {
      return { state: 'open', text: null, relayNote: null, contentKey }
    }
    const { text, relayNote } = await decryptLetter(message, contentKey)
    return { state: 'open', text, relayNote, contentKey }
  } catch {
    return { state: 'unreadable' }
  }
}

/** Download an attachment and decrypt it with the letter's content key: a Blob of its original type. */
export async function openAttachment(attachment: Attachment, contentKey: Uint8Array): Promise<Blob> {
  const stored = await downloadAttachment(attachment.id)
  if (!attachment.nonce) throw new Error('This attachment was stored without encryption details.')
  const plain = await decryptFile(stored, attachment.nonce, contentKey)
  return new Blob([plain as BlobPart], { type: attachment.mimeType })
}
