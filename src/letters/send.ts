import { getGroupPublicKey, postLetter, uploadAttachment } from '../api/letters'
import { toApiError } from '../api/client'
import { encryptFile, encryptLetter, forgetContentKey, openEnvelope, type Keypair, type Reader } from '../crypto'
import type { Message } from '../types'

// Sending a letter (README "End-to-end mode: Sending and reading letters",
// "Paper letters", "Sending exactly once"). A fresh content key encrypts the
// body, the note to the group and any attached file; it is sealed to the
// writer and to the group that prints and mails the letter. Only the
// ciphertext and the sealed copies go to the API. A group admin may write as
// one of the group's managed writers or its anonymous writer (README "Message
// fields", `user`); the group then keeps an envelope too.

/** Files the API accepts for a scan or a photo of a paper letter. */
export const ACCEPTED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
/** The API's upload limit (UPLOAD_MAX_BYTES), which applies to the encrypted file. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
/** What encryption adds to a file: XChaCha20-Poly1305's 16-byte tag. */
const FILE_OVERHEAD_BYTES = 16
/** The largest file that still fits under the upload limit once encrypted. */
export const MAX_FILE_BYTES = MAX_UPLOAD_BYTES - FILE_OVERHEAD_BYTES

/**
 * The letter was sent, but its file didn't upload. The draft is spent (sending
 * it again would only get this letter back); retry the file alone with
 * uploadLetterFile, using this letter and its content key. Whoever catches this
 * owns `contentKey`, and forgets it when done.
 */
export class AttachmentNotUploaded extends Error {
  readonly letter: Message
  readonly contentKey: Uint8Array
  readonly cause: unknown
  constructor(letter: Message, contentKey: Uint8Array, cause: unknown) {
    super('The letter was sent, but its attachment didn’t upload.')
    this.name = 'AttachmentNotUploaded'
    this.letter = letter
    this.contentKey = contentKey
    this.cause = cause
  }
}

export interface LetterDraft {
  prisonerId: number
  /** The group that prints and mails it (one of the facility's relay groups). */
  relayChapterId: number
  /** The typed letter. Empty for a paper letter or a scan-only letter. */
  text: string
  /** Instructions for the group; never sent to the prisoner. */
  relayNote: string
  /** Written by hand and handed to the group: nothing to print. */
  paper: boolean
  /** A scan of a handwritten letter, or a photo of a paper one. */
  file: File | null
  /** Made once per letter and reused on every retry, so it is never mailed twice. */
  idempotencyKey: string
  /** Sent again in place of this returned or declined letter of the writer's, to the same prisoner. */
  resendOf?: number | null
}

/**
 * 128 random bits as hex. (crypto.randomUUID exists only in secure contexts;
 * getRandomValues works everywhere, e.g. the dev server reached over the LAN.)
 */
export function newIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** A draft can be sent when it has something in it: text, a file, or the paper tick. */
export const draftHasContent = (d: Pick<LetterDraft, 'text' | 'paper' | 'file'>) => d.paper || d.text.trim() !== '' || d.file !== null

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A writer sending their own letter. */
export interface WriterSender {
  userId: number
  keypair: Keypair
}

/**
 * A group admin writing as one of the group's writers (README "Message fields",
 * `user`: "A chapter account may name one of its group's managed writers, or
 * omit it to send as the group's anonymous writer").
 */
export interface GroupSender {
  /** The admin's own group: it manages the writer, so it keeps an envelope (README "Sending and reading letters"). */
  groupId: number
  /** The group keypair open in this session, to recover the content key from a retried letter. */
  groupKeypair: Keypair
  /**
   * The managed writer the letter is from, or null for the group's anonymous
   * writer. A writer without a public key gets no envelope (the API refuses one);
   * the group's housekeeping adds it once they have keys.
   */
  writer: { id: number; publicKey: string | null } | null
}

export type Sender = WriterSender | GroupSender

const isGroupSender = (s: Sender): s is GroupSender => 'groupId' in s

/** A group's current public key, as a reader. */
async function groupReader(chapter: number, missing: string): Promise<Reader> {
  const group = await getGroupPublicKey(chapter)
  if (!group.publicKey) throw new Error(missing)
  return { readerType: 'chapter', readerId: chapter, publicKey: group.publicKey, keyVersion: group.keyVersion }
}

/**
 * Who a letter is sealed to. A writer's own letter: the writer and the relay
 * group. Written by a group: the managed writer (when they have keys), the
 * group itself, and the relay group when that is another group.
 */
async function readersFor(draft: LetterDraft, sender: Sender): Promise<Reader[]> {
  const relay = await groupReader(draft.relayChapterId, 'This group cannot receive letters yet.')
  if (!isGroupSender(sender)) return [{ readerType: 'user', readerId: sender.userId, publicKey: sender.keypair.publicKey }, relay]
  const readers: Reader[] = []
  if (sender.writer?.publicKey) readers.push({ readerType: 'user', readerId: sender.writer.id, publicKey: sender.writer.publicKey })
  if (sender.groupId !== draft.relayChapterId) readers.push(await groupReader(sender.groupId, 'Your group has no group key yet.'))
  readers.push(relay)
  return readers
}

/**
 * The key the stored letter was sealed with. Normally this attempt's; but a
 * retry of a letter already made gets that letter back (the Idempotency-Key),
 * sealed with the first attempt's key, which only its envelope still holds.
 */
async function storedContentKey(message: Message, sender: Sender, attemptKey: Uint8Array): Promise<Uint8Array> {
  if (!isGroupSender(sender)) {
    const mine = message.envelopes?.find((e) => e.readerType === 'user' && e.readerId === sender.userId)
    if (!mine) return attemptKey
    await forgetContentKey(attemptKey)
    return openEnvelope(mine, sender.keypair)
  }
  const ours = message.envelopes?.find((e) => e.readerType === 'chapter' && e.readerId === sender.groupId)
  if (!ours) return attemptKey
  try {
    const key = await openEnvelope(ours, sender.groupKeypair)
    await forgetContentKey(attemptKey)
    return key
  } catch {
    // Sealed to a group key newer than this session's (a rotation in between): keep this attempt's.
    return attemptKey
  }
}

/** Encrypt and post, re-sealing once if a group's key changed meanwhile (409 KeyVersionError). */
async function encryptAndPost(draft: LetterDraft, sender: Sender) {
  for (let attempt = 0; ; attempt++) {
    const readers = await readersFor(draft, sender)
    // A paper letter still carries the encryption of an empty body: its content key encrypts the photo.
    const { contentKey, fields } = await encryptLetter(draft.paper ? '' : draft.text, readers, draft.relayNote.trim() || undefined)
    try {
      const message = await postLetter(
        {
          sender: 'user',
          // Written by a group: the managed writer; left out for the anonymous writer.
          ...(isGroupSender(sender) && sender.writer ? { user: sender.writer.id } : {}),
          prisoner: draft.prisonerId,
          relayChapter: draft.relayChapterId,
          ...(draft.paper ? { paper: true } : {}),
          ...(draft.resendOf ? { resendOf: draft.resendOf } : {}),
          ...fields,
        },
        draft.idempotencyKey,
      )
      return { message, contentKey: await storedContentKey(message, sender, contentKey) }
    } catch (err) {
      await forgetContentKey(contentKey)
      const e = toApiError(err)
      if (attempt === 0 && e.status === 409 && e.name === 'KeyVersionError') continue // fetch the new key, seal again
      if (attempt < 3 && e.status === 409 && e.name === 'IdempotencyError') {
        await wait(1000) // the first attempt is still being processed (a double click)
        continue
      }
      throw err
    }
  }
}

/**
 * Encrypt a letter's file with the letter's content key and upload it. The
 * Idempotency-Key is the letter's own plus "-file", so a retry after a lost
 * answer gets the stored file back, not a second copy.
 */
export async function uploadLetterFile(letter: Message, file: File, contentKey: Uint8Array, idempotencyKey: string) {
  const plain = new Uint8Array(await file.arrayBuffer())
  const sealed = await encryptFile(plain, contentKey)
  await uploadAttachment({
    message: letter.id,
    bytes: sealed.bytes,
    nonce: sealed.nonce,
    type: file.type,
    name: file.name,
    idempotencyKey: `${idempotencyKey}-file`,
  })
}

/**
 * Send a letter, as the signed-in writer or, for a group admin, as one of the
 * group's writers; returns the stored letter (its `chat` is the thread). Throws
 * AttachmentNotUploaded if the letter went but its file didn't.
 */
export async function sendLetter(draft: LetterDraft, sender: Sender): Promise<Message> {
  if (draft.file) {
    if (!ACCEPTED_FILE_TYPES.includes(draft.file.type)) throw new Error('Only PDF, JPG and PNG files can be sent.')
    if (draft.file.size > MAX_FILE_BYTES) throw new Error('That file is too large: files can be up to 20 MB.')
  }
  const { message, contentKey } = await encryptAndPost(draft, sender)
  if (draft.file) {
    try {
      await uploadLetterFile(message, draft.file, contentKey, draft.idempotencyKey)
    } catch (err) {
      // The key goes with the error, for the retry.
      throw new AttachmentNotUploaded(message, contentKey, err)
    }
  }
  await forgetContentKey(contentKey)
  return message
}
