import { getGroupPublicKey, postLetter, uploadAttachment } from '../api/letters'
import { toApiError } from '../api/client'
import { decryptLetter, encryptFile, encryptLetter, forgetContentKey, openEnvelope, type Keypair, type Reader } from '../crypto'
import type { Message, ReaderType } from '../types'

// Sending a letter (README "End-to-end mode: Sending and reading letters",
// "Paper letters", "Sending exactly once"). A fresh content key encrypts the
// body, the note to the group and any attached file; it is sealed to the
// writer and to the group that prints and mails the letter. Only the
// ciphertext and the sealed copies go to the API. A group admin may write as
// one of the group's managed writers or its anonymous writer (README "Message
// fields", `user`); the group then keeps an envelope too.

/** Files the API accepts for a scan or a photo of a paper letter. */
const ACCEPTED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
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
  /** The letter was an earlier attempt's (see SentLetter). */
  readonly replay: Replay | null
  constructor(letter: Message, contentKey: Uint8Array, cause: unknown, replay: Replay | null = null) {
    super('The letter was sent, but its attachment didn’t upload.')
    this.name = 'AttachmentNotUploaded'
    this.letter = letter
    this.contentKey = contentKey
    this.cause = cause
    this.replay = replay
  }
}

/**
 * The letter was sent, by an earlier attempt under the same Idempotency-Key,
 * and this session cannot open the letter that was stored: typically a group's
 * key was rotated in between, and the stored letter is sealed to the new one.
 * Its file is refused rather than encrypted under a key no envelope holds,
 * which nobody could ever open. Signing in again gets the new key; then the
 * file can be added to the letter.
 */
export class ReplayedFileRefused extends Error {
  readonly letter: Message
  constructor(letter: Message) {
    super(
      'The file wasn’t added. The letter itself had already gone through on an earlier try, and this session can’t open ' +
        'the letter that was saved, so a file added now couldn’t be read by anyone. Sign out and in again, then add the file to the letter.',
    )
    this.name = 'ReplayedFileRefused'
    this.letter = letter
  }
}

/**
 * The API answered with the letter an earlier attempt under this
 * Idempotency-Key made (`Idempotent-Replayed`), not one made from this attempt.
 * `sameText`: whether its body and note read as this attempt's would have; null
 * when this session can't open it to tell.
 */
export interface Replay {
  sameText: boolean | null
}

/** A sent letter: as stored, and whether it was an earlier attempt's (`replay`). */
export interface SentLetter {
  message: Message
  replay: Replay | null
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

/** One letter (or reply) to encrypt and post: what encryptAndPost needs, whoever is sending. */
export interface SealedPost {
  /** The typed body; an empty string when there is only a file (or a paper letter). */
  text: string
  relayNote?: string
  /**
   * Who may open it. Called afresh on every attempt, because a group's key may
   * have been rotated meanwhile (409 KeyVersionError) and must be fetched again.
   */
  readers: () => Promise<Reader[]>
  /** The rest of POST /messaging/message: sender, prisoner, user, reference… (never the text). */
  body: Record<string, unknown>
  /** Made once per letter and reused on every retry, so it is never sent twice. */
  idempotencyKey: string
  /** The envelope this client opens on the stored letter, and the keypair that opens it. */
  self: { readerType: ReaderType; readerId: number; keypair: Keypair }
}

type EncryptedFields = Awaited<ReturnType<typeof encryptLetter>>['fields']

/** The envelope this client opens on a letter. */
const ownEnvelope = (envelopes: Message['envelopes'] | EncryptedFields['envelopes'], self: SealedPost['self']) =>
  envelopes?.find((e) => e.readerType === self.readerType && e.readerId === self.readerId)

/**
 * Whether the stored letter is an earlier attempt's: the API says so
 * (`Idempotent-Replayed`), or the envelope it returns is not the one just sent
 * (sealed boxes are randomised, so this attempt's copy never matches an
 * earlier one's).
 */
function isReplay(message: Message, self: SealedPost['self'], sent: EncryptedFields, replayedHeader: boolean): boolean {
  if (replayedHeader) return true
  const stored = ownEnvelope(message.envelopes, self)
  const mine = ownEnvelope(sent.envelopes, self)
  return Boolean(stored && mine && stored.wrappedKey !== mine.wrappedKey)
}

/**
 * The content key of a stored letter an earlier attempt made, from this
 * client's own envelope on it; null when there is none, or it won't open (for a
 * group, sealed to a group key newer than this session's).
 */
async function storedContentKey(message: Message, self: SealedPost['self']): Promise<Uint8Array | null> {
  const mine = ownEnvelope(message.envelopes, self)
  if (!mine) return null
  return openEnvelope(mine, self.keypair).catch(() => null)
}

/** Whether the stored letter's body and note are the ones this attempt would have sent; null if it won't decrypt. */
async function readsTheSame(message: Message, contentKey: Uint8Array, post: SealedPost): Promise<boolean | null> {
  try {
    const stored = await decryptLetter(message, contentKey)
    return stored.text === post.text && (stored.relayNote ?? '') === (post.relayNote?.trim() ?? '')
  } catch {
    return null
  }
}

/**
 * Encrypt and post, re-sealing once if a group's key changed meanwhile (409
 * KeyVersionError). Returns the stored letter, this attempt's content key, and
 * whether the letter is an earlier attempt's (then that key did not seal it).
 */
async function encryptAndPost(post: SealedPost): Promise<{ message: Message; attemptKey: Uint8Array; replayed: boolean }> {
  for (let attempt = 0; ; attempt++) {
    const readers = await post.readers()
    const { contentKey, fields } = await encryptLetter(post.text, readers, post.relayNote?.trim() || undefined)
    try {
      const { message, replayed } = await postLetter({ ...post.body, ...fields }, post.idempotencyKey)
      return { message, attemptKey: contentKey, replayed: isReplay(message, post.self, fields, replayed) }
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

/** Refuse a file the API would refuse, before anything is sent. */
function checkFile(file: File | null) {
  if (!file) return
  if (!ACCEPTED_FILE_TYPES.includes(file.type)) throw new Error('Only PDF, JPG and PNG files can be sent.')
  if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large: files can be up to 20 MB.')
}

/**
 * Encrypt and post a letter, then upload its file encrypted with the same
 * content key. Shared by sendLetter and recordReply (src/letters/record.ts).
 *
 * A retry may get back the letter an earlier attempt made (the
 * Idempotency-Key): that letter was sealed with the earlier attempt's key, which
 * only its envelope still holds. The file is encrypted with that key, opened
 * from this client's envelope; if it won't open (a group key rotated in
 * between) the file is refused with ReplayedFileRefused, never encrypted under
 * a key no envelope holds. Throws AttachmentNotUploaded if the letter went but
 * its file didn't.
 */
export async function sealAndSend(post: SealedPost, file: File | null): Promise<SentLetter> {
  checkFile(file)
  const { message, attemptKey, replayed } = await encryptAndPost(post)
  let contentKey: Uint8Array | null = attemptKey
  let replay: Replay | null = null
  if (replayed) {
    await forgetContentKey(attemptKey)
    contentKey = await storedContentKey(message, post.self)
    replay = { sameText: contentKey ? await readsTheSame(message, contentKey, post) : null }
    if (!contentKey && file) throw new ReplayedFileRefused(message)
  }
  if (file && contentKey) {
    try {
      await uploadLetterFile(message, file, contentKey, post.idempotencyKey)
    } catch (err) {
      // The key goes with the error, for the retry.
      throw new AttachmentNotUploaded(message, contentKey, err, replay)
    }
  }
  if (contentKey) await forgetContentKey(contentKey)
  return { message, replay }
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
 * group's writers; returns the stored letter (its `chat` is the thread) and, if
 * it was an earlier attempt's, `replay`. Throws AttachmentNotUploaded if the
 * letter went but its file didn't, and ReplayedFileRefused if it went on an
 * earlier attempt and its file can't be encrypted for it from this session.
 */
export function sendLetter(draft: LetterDraft, sender: Sender): Promise<SentLetter> {
  return sealAndSend(
    {
      // A paper letter still carries the encryption of an empty body: its content key encrypts the photo.
      text: draft.paper ? '' : draft.text,
      relayNote: draft.relayNote,
      readers: () => readersFor(draft, sender),
      body: {
        sender: 'user',
        // Written by a group: the managed writer; left out for the anonymous writer.
        ...(isGroupSender(sender) && sender.writer ? { user: sender.writer.id } : {}),
        prisoner: draft.prisonerId,
        relayChapter: draft.relayChapterId,
        ...(draft.paper ? { paper: true } : {}),
        ...(draft.resendOf ? { resendOf: draft.resendOf } : {}),
      },
      idempotencyKey: draft.idempotencyKey,
      // The envelope this client opens on a retried letter: the writer's own, or the writing group's.
      self: isGroupSender(sender)
        ? { readerType: 'chapter', readerId: sender.groupId, keypair: sender.groupKeypair }
        : { readerType: 'user', readerId: sender.userId, keypair: sender.keypair },
    },
    draft.file,
  )
}
