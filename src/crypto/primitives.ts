import { fromBase64, getSodium, toBase64 } from './sodium'

// The primitives, as the API and the Android client use them:
//   bodies, files, wrapped keys: XChaCha20-Poly1305 (crypto_aead_xchacha20poly1305_ietf),
//     no associated data. Not crypto_secretbox, which is a different cipher.
//   envelopes, group keys: sealed boxes (crypto_box_seal) to X25519 public keys.
// Everything that crosses the API is standard base64.

/** Base64 keypair. The private half never leaves the device unwrapped. */
export interface Keypair {
  publicKey: string
  privateKey: string
}

export interface Encrypted {
  ciphertext: string
  nonce: string
}

export async function generateKeypair(): Promise<Keypair> {
  const s = await getSodium()
  const kp = s.crypto_box_keypair()
  return { publicKey: await toBase64(kp.publicKey), privateKey: await toBase64(kp.privateKey) }
}

/** A fresh 32-byte key for one letter (and its attachments). */
export async function generateContentKey(): Promise<Uint8Array> {
  const s = await getSodium()
  return s.crypto_aead_xchacha20poly1305_ietf_keygen()
}

/**
 * A key of all zeros is one that was wiped (forgetContentKey, wipe) while
 * something still held it. Encrypting or sealing with it would succeed, and
 * leave a letter or a file that nobody can tell from a good one but anybody
 * could open; so it is refused instead.
 */
export function refuseWipedKey(s: Awaited<ReturnType<typeof getSodium>>, key: Uint8Array): void {
  if (key.length === 0 || s.is_zero(key)) throw new Error('This key has already been wiped, so nothing was encrypted with it.')
}

/** The same as Encrypted, as bytes: for files, which would cost three times their size as base64. */
export interface EncryptedBytes {
  /** The ciphertext with its 16-byte tag at the end (libsodium's combined form): what the API stores for a file. */
  ciphertext: Uint8Array
  nonce: Uint8Array
}

/**
 * Encrypt bytes under a 32-byte key, with a random 24-byte nonce, and keep the
 * result as bytes. Byte for byte what `encrypt` makes before its base64.
 */
export async function encryptBytes(plain: Uint8Array, key: Uint8Array): Promise<EncryptedBytes> {
  const s = await getSodium()
  refuseWipedKey(s, key)
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plain, null, null, nonce, key)
  return { ciphertext, nonce }
}

/** Decrypt bytes made by encryptBytes (or encrypt, once decoded). Throws if the key is wrong or the ciphertext was altered. */
export async function decryptBytes(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  const s = await getSodium()
  return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, null, nonce, key)
}

/** Encrypt bytes or a string (UTF-8) under a 32-byte key, with a random 24-byte nonce. Base64 out: bodies, notes, wrapped keys. */
export async function encrypt(plain: Uint8Array | string, key: Uint8Array): Promise<Encrypted> {
  const s = await getSodium()
  const { ciphertext, nonce } = await encryptBytes(typeof plain === 'string' ? s.from_string(plain) : plain, key)
  return { ciphertext: await toBase64(ciphertext), nonce: await toBase64(nonce) }
}

/** Throws if the key is wrong or the ciphertext was altered. */
export async function decrypt(ciphertext: string, nonce: string, key: Uint8Array): Promise<Uint8Array> {
  return decryptBytes(await fromBase64(ciphertext), await fromBase64(nonce), key)
}

export async function decryptText(ciphertext: string, nonce: string, key: Uint8Array): Promise<string> {
  const s = await getSodium()
  return s.to_string(await decrypt(ciphertext, nonce, key))
}

/** Seal bytes to a public key. Only the matching private key opens it. */
export async function sealTo(publicKey: string, bytes: Uint8Array): Promise<string> {
  const s = await getSodium()
  return toBase64(s.crypto_box_seal(bytes, await fromBase64(publicKey)))
}

/** Open a sealed box with a keypair. Throws if it was not sealed to this key. */
export async function openSealed(sealed: string, keypair: Keypair): Promise<Uint8Array> {
  const s = await getSodium()
  return s.crypto_box_seal_open(await fromBase64(sealed), await fromBase64(keypair.publicKey), await fromBase64(keypair.privateKey))
}

/** The public key belonging to a private key (to rebuild a keypair after unwrapping). */
export async function publicKeyOf(privateKey: string): Promise<string> {
  const s = await getSodium()
  return toBase64(s.crypto_scalarmult_base(await fromBase64(privateKey)))
}

/**
 * Lock a private key under a wrapping key. The API stores the result as a JSON
 * string: {"ciphertext": base64, "nonce": base64}.
 */
export async function wrapPrivateKey(privateKey: string, wrappingKey: Uint8Array): Promise<string> {
  const raw = await fromBase64(privateKey)
  const { ciphertext, nonce } = await encrypt(raw, wrappingKey)
  ;(await getSodium()).memzero(raw)
  return JSON.stringify({ ciphertext, nonce })
}

/** Throws if the wrapping key is wrong (wrong password or code). */
export async function unwrapPrivateKey(wrapped: string, wrappingKey: Uint8Array): Promise<string> {
  const { ciphertext, nonce } = JSON.parse(wrapped) as Encrypted
  const raw = await decrypt(ciphertext, nonce, wrappingKey)
  const privateKey = await toBase64(raw)
  ;(await getSodium()).memzero(raw)
  return privateKey
}

/** SHA-256 hex, for claim-token hashes (the server only ever sees the hash). */
export async function sha256Hex(text: string): Promise<string> {
  const s = await getSodium()
  return s.to_hex(s.crypto_hash_sha256(s.from_string(text)))
}
