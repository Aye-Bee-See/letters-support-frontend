import type { KdfParams } from '../types'
import { fromBase64, getSodium, toBase64, wipe } from './sodium'

// Key derivation, byte for byte as agreed with the API and the Android client
// (password-split-proposal-2026-09-19.md section 3; README "Signing in without
// sending the password"). Test vectors in crypto.test.ts.

/** The parameters every client writes for new keys (confirmed 22 September). */
export const KDF_PARAMS: Readonly<KdfParams> = Object.freeze({
  kdf: 'argon2id',
  alg: 2, // crypto_pwhash_ALG_ARGON2ID13
  opslimit: 2,
  memlimit: 67108864, // 64 MiB
})

const SALT_BYTES = 16

/** A password as the KDF takes it: Unicode NFKC, then UTF-8. */
export function passwordBytes(password: string): Uint8Array {
  return new TextEncoder().encode(password.normalize('NFKC'))
}

/**
 * A typed code (recovery code, claim token, invite code) the way the API
 * normalises it before hashing: upper case, letters and digits only, O to 0,
 * I and L to 1. So "abcd-efgh" and "ABCDEFGH" are the same code.
 */
export function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

export async function newSalt(): Promise<string> {
  const s = await getSodium()
  return toBase64(s.randombytes_buf(SALT_BYTES))
}

/**
 * Argon2id: 32 bytes from a secret, a base64 salt, and stored parameters.
 * Parameters are read from the record, never assumed, so keys made with other
 * costs later still open. Anything but Argon2id is refused.
 */
export async function deriveKey(secret: Uint8Array, saltB64: string, params: KdfParams): Promise<Uint8Array> {
  const s = await getSodium()
  if (params.kdf !== 'argon2id' || params.alg !== s.crypto_pwhash_ALG_ARGON2ID13) {
    throw new Error(`Unsupported key derivation: ${JSON.stringify(params)}`)
  }
  if (!Number.isInteger(params.opslimit) || !Number.isInteger(params.memlimit)) {
    throw new Error('Key derivation parameters are missing opslimit or memlimit.')
  }
  const salt = await fromBase64(saltB64)
  if (salt.length !== s.crypto_pwhash_SALTBYTES) throw new Error('Key derivation salt must be 16 bytes.')
  return s.crypto_pwhash(32, secret, salt, params.opslimit!, params.memlimit!, params.alg)
}

export interface SplitKeys {
  /** Locks the account's private key. Never leaves the device. */
  wrapKey: Uint8Array
  /** Sent to the API as the "password": base64, 44 characters. */
  authKey: string
}

/**
 * The password split: one Argon2id run, then two independent keys.
 *   wrapKey = crypto_kdf_derive_from_key(32, 1, "abcwrap_", master)
 *   authKey = crypto_kdf_derive_from_key(32, 2, "abcauth_", master)
 * The master key is wiped before returning.
 */
export async function splitFromMaster(master: Uint8Array): Promise<SplitKeys> {
  const s = await getSodium()
  const wrapKey = s.crypto_kdf_derive_from_key(32, 1, 'abcwrap_', master)
  const authBytes = s.crypto_kdf_derive_from_key(32, 2, 'abcauth_', master)
  const authKey = await toBase64(authBytes)
  await wipe(authBytes)
  return { wrapKey, authKey }
}

/** Password to split keys, with the account's salt and parameters. */
export async function deriveSplitKeys(password: string, saltB64: string, params: KdfParams): Promise<SplitKeys> {
  const secret = passwordBytes(password)
  const master = await deriveKey(secret, saltB64, params)
  await wipe(secret)
  try {
    return await splitFromMaster(master)
  } finally {
    await wipe(master)
  }
}

/**
 * A typed code to a wrapping key. Unlike the password, a recovery code or
 * claim token's Argon2id output locks the private key directly: there is no
 * auth key to split off (e2e-client.js wrapPrivateKey with a code).
 */
export async function deriveCodeKey(code: string, saltB64: string, params: KdfParams): Promise<Uint8Array> {
  const secret = new TextEncoder().encode(normalizeCode(code))
  try {
    return await deriveKey(secret, saltB64, params)
  } finally {
    await wipe(secret)
  }
}
