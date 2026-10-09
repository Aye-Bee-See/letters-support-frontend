import { downloadAttachment } from '../api/letters'
import { decryptFile, decryptLetter, forgetContentKey, openEnvelope, type Keypair } from '../crypto'
import type { Attachment, Envelope, Message, StoredEnvelope } from '../types'

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
  /** The version of the group key this session holds (`keys.orgKey.keyVersion`), to tell a stale envelope from a broken one. */
  groupKeyVersion?: number | null
}

export type OpenedLetter =
  /** Opened. `text` is null for a letter with no typed body (a paper letter, or a scan). */
  | { state: 'open'; text: string | null; relayNote: string | null; contentKey: Uint8Array }
  /** No envelope for this reader yet: e.g. a reply recorded before the writer had keys; the group shares it on its next sign-in. */
  | { state: 'waiting' }
  /**
   * The group's envelope would not open, and it names a group key version other
   * than the one this session holds (README "Sending and reading letters":
   * envelopes carry `keyVersion` on reads, API #198). `sealedWith` below
   * `holding`: sealed under an older group key; above it: this session's key is
   * the old one, and signing in again picks up the new.
   */
  | { state: 'old-key'; sealedWith: number; holding: number }
  /** An envelope exists but would not open, or the body would not decrypt. */
  | { state: 'unreadable' }

/** The envelope this reader can open, and the keypair that opens it. */
function envelopeFor(envelopes: (Envelope | StoredEnvelope)[], reader: LetterReader): { envelope: Envelope; keypair: Keypair } | null {
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
  let contentKey: Uint8Array | null = null
  try {
    contentKey = await openEnvelope(found.envelope, found.keypair)
    if (!message.ciphertext || !message.nonce) {
      return { state: 'open', text: null, relayNote: null, contentKey }
    }
    const { text, relayNote } = await decryptLetter(message, contentKey)
    return { state: 'open', text, relayNote, contentKey }
  } catch {
    // The envelope opened but the body would not: the key goes no further.
    if (contentKey) await forgetContentKey(contentKey)
    const sealedWith = found.envelope.readerType === 'chapter' ? found.envelope.keyVersion : null
    const holding = reader.groupKeyVersion
    if (typeof sealedWith === 'number' && typeof holding === 'number' && sealedWith !== holding) return { state: 'old-key', sealedWith, holding }
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

/** Anything that carries an opened letter: a thread's rows, the print page's letter. */
type HoldsOpened = { opened: OpenedLetter | null } | null | undefined

/**
 * Wipe the content keys of letters opened earlier (`before`) that `now` no
 * longer holds: on leaving a page (`now` empty), or when a reload replaced
 * them. A letter a reload kept as it was (Thread's loadThread reuses unchanged
 * ones) keeps the same key object, which stays in use. Each key is wiped once.
 */
export function forgetReplacedKeys(before: readonly HoldsOpened[] | null | undefined, now: readonly HoldsOpened[] | null | undefined = []): void {
  const keys = (list: readonly HoldsOpened[] | null | undefined) =>
    (list ?? []).flatMap((item) => (item?.opened?.state === 'open' ? [item.opened.contentKey] : []))
  const kept = new Set(keys(now))
  for (const key of new Set(keys(before))) if (!kept.has(key)) void forgetContentKey(key)
}
