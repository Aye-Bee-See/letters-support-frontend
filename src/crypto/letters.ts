import type { Envelope } from '../types'
import { decryptBytes, decryptText, encrypt, encryptBytes, generateContentKey, openSealed, refuseWipedKey, sealTo, type Keypair } from './primitives'
import { fromBase64, getSodium, toBase64 } from './sodium'

// Letters in end-to-end mode (README "Sending and reading letters"): each letter
// gets its own content key; the body, relay note and attachments are encrypted
// with it; the content key is sealed to every reader in an envelope.

/**
 * Someone who may open a letter. A group envelope names the version of the
 * group key it was sealed to; a stale version is refused with 409
 * KeyVersionError (fetch the group's public key again, re-seal, retry).
 */
export type Reader =
  | { readerType: 'user'; readerId: number; publicKey: string }
  | { readerType: 'chapter'; readerId: number; publicKey: string; keyVersion: number }

export interface EncryptedLetter {
  ciphertext: string
  nonce: string
  relayNoteCiphertext?: string
  relayNoteNonce?: string
  envelopes: Envelope[]
}

/**
 * Encrypt a letter for its readers. Returns the POST /messaging/message fields
 * and the content key (keep it to encrypt attachments, then drop it).
 */
export async function encryptLetter(
  text: string,
  readers: Reader[],
  relayNote?: string,
): Promise<{ contentKey: Uint8Array; fields: EncryptedLetter }> {
  if (readers.length === 0) throw new Error('A letter needs at least one reader.')
  const contentKey = await generateContentKey()
  const body = await encrypt(text, contentKey)
  const envelopes: Envelope[] = []
  for (const r of readers) {
    envelopes.push({
      readerType: r.readerType,
      readerId: r.readerId,
      wrappedKey: await sealTo(r.publicKey, contentKey),
      ...(r.readerType === 'chapter' ? { keyVersion: r.keyVersion } : {}),
    })
  }
  const fields: EncryptedLetter = { ciphertext: body.ciphertext, nonce: body.nonce, envelopes }
  if (relayNote !== undefined && relayNote !== '') {
    const note = await encrypt(relayNote, contentKey)
    fields.relayNoteCiphertext = note.ciphertext
    fields.relayNoteNonce = note.nonce
  }
  return { contentKey, fields }
}

/** Seal an existing letter's content key to one more reader (POST /messaging/envelope). */
export async function envelopeFor(contentKey: Uint8Array, reader: Reader): Promise<Envelope> {
  refuseWipedKey(await getSodium(), contentKey)
  return {
    readerType: reader.readerType,
    readerId: reader.readerId,
    wrappedKey: await sealTo(reader.publicKey, contentKey),
    ...(reader.readerType === 'chapter' ? { keyVersion: reader.keyVersion } : {}),
  }
}

/**
 * A letter's body typed again (README "Sending and reading letters": editing a
 * letter means new `ciphertext` and `nonce` under the same content key, so every
 * envelope it already has still opens it). Send both with PUT /messaging/message.
 */
export async function reencryptLetter(text: string, contentKey: Uint8Array): Promise<{ ciphertext: string; nonce: string }> {
  const { ciphertext, nonce } = await encrypt(text, contentKey)
  return { ciphertext, nonce }
}

/** Open one of the caller's envelopes to get the letter's content key. */
export function openEnvelope(envelope: Pick<Envelope, 'wrappedKey'>, keypair: Keypair): Promise<Uint8Array> {
  return openSealed(envelope.wrappedKey, keypair)
}

/** Decrypt a letter's body and relay note with its content key. */
export async function decryptLetter(
  message: { ciphertext?: string | null; nonce?: string | null; relayNoteCiphertext?: string | null; relayNoteNonce?: string | null },
  contentKey: Uint8Array,
): Promise<{ text: string; relayNote: string | null }> {
  if (!message.ciphertext || !message.nonce) throw new Error('This letter has no encrypted body.')
  const text = await decryptText(message.ciphertext, message.nonce, contentKey)
  const relayNote =
    message.relayNoteCiphertext && message.relayNoteNonce
      ? await decryptText(message.relayNoteCiphertext, message.relayNoteNonce, contentKey)
      : null
  return { text, relayNote }
}

/**
 * Encrypt an attachment (a scan, a photo) with the letter's content key. Upload
 * `bytes` with the `nonce` field (base64, like every nonce the API takes). Bytes
 * in, bytes out: a 20 MB scan is never turned into a base64 string.
 */
export async function encryptFile(bytes: Uint8Array, contentKey: Uint8Array): Promise<{ bytes: Uint8Array; nonce: string }> {
  const { ciphertext, nonce } = await encryptBytes(bytes, contentKey)
  return { bytes: ciphertext, nonce: await toBase64(nonce) }
}

/** Decrypt a downloaded attachment (the API serves the ciphertext as-is), as bytes. */
export async function decryptFile(bytes: Uint8Array, nonce: string, contentKey: Uint8Array): Promise<Uint8Array> {
  return decryptBytes(bytes, await fromBase64(nonce), contentKey)
}

/**
 * Drop a content key once the letter and its attachments are done: its bytes
 * are zeroed, and anything that still tries to encrypt or seal with it is
 * refused (refuseWipedKey). Wiping the same key twice is harmless.
 */
export async function forgetContentKey(contentKey: Uint8Array): Promise<void> {
  ;(await getSodium()).memzero(contentKey)
}
