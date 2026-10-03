import { getGroupPublicKey, postLetter, uploadAttachment } from '../api/letters'
import { toApiError } from '../api/client'
import { encryptFile, encryptLetter, forgetContentKey, type Keypair, type Reader } from '../crypto'
import type { Message } from '../types'

// Sending a letter (README "End-to-end mode: Sending and reading letters",
// "Paper letters", "Sending exactly once"). A fresh content key encrypts the
// body, the note to the group and any attached file; it is sealed to the
// writer and to the group that prints and mails the letter. Only the
// ciphertext and the sealed copies go to the API.

/** Files the API accepts for a scan or a photo of a paper letter. */
export const ACCEPTED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
export const MAX_FILE_BYTES = 20 * 1024 * 1024

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

/** Encrypt and post, re-sealing once if the group's key changed meanwhile (409 KeyVersionError). */
async function encryptAndPost(draft: LetterDraft, writer: { userId: number; keypair: Keypair }) {
  for (let attempt = 0; ; attempt++) {
    const group = await getGroupPublicKey(draft.relayChapterId)
    if (!group.publicKey) throw new Error('This group cannot receive letters yet.')
    const readers: Reader[] = [
      { readerType: 'user', readerId: writer.userId, publicKey: writer.keypair.publicKey },
      { readerType: 'chapter', readerId: draft.relayChapterId, publicKey: group.publicKey, keyVersion: group.keyVersion },
    ]
    // A paper letter still carries the encryption of an empty body: its content key encrypts the photo.
    const { contentKey, fields } = await encryptLetter(draft.paper ? '' : draft.text, readers, draft.relayNote.trim() || undefined)
    try {
      const message = await postLetter(
        {
          sender: 'user',
          prisoner: draft.prisonerId,
          relayChapter: draft.relayChapterId,
          ...(draft.paper ? { paper: true } : {}),
          ...(draft.resendOf ? { resendOf: draft.resendOf } : {}),
          ...fields,
        },
        draft.idempotencyKey,
      )
      return { message, contentKey }
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

/** Send a letter; returns the stored letter (its `chat` is the thread). */
export async function sendLetter(draft: LetterDraft, writer: { userId: number; keypair: Keypair }): Promise<Message> {
  if (draft.file) {
    if (!ACCEPTED_FILE_TYPES.includes(draft.file.type)) throw new Error('Only PDF, JPG and PNG files can be sent.')
    if (draft.file.size > MAX_FILE_BYTES) throw new Error('That file is larger than 20 MB.')
  }
  const { message, contentKey } = await encryptAndPost(draft, writer)
  try {
    if (draft.file) {
      const plain = new Uint8Array(await draft.file.arrayBuffer())
      const sealed = await encryptFile(plain, contentKey)
      await uploadAttachment({
        message: message.id,
        bytes: sealed.bytes,
        nonce: sealed.nonce,
        type: draft.file.type,
        name: draft.file.name,
        idempotencyKey: `${draft.idempotencyKey}-file`,
      })
    }
  } finally {
    await forgetContentKey(contentKey)
  }
  return message
}
