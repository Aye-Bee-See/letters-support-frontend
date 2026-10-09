import type { KdfParams } from '../types'
import { argon2id } from './kdfRunner'
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

/**
 * The most any stored record or server answer may ask for. The agreed
 * parameters are the floor; this ceiling leaves room to raise the cost later
 * while keeping a hostile answer from hanging or crashing the tab (512 MiB is
 * already more than some phones will give one page).
 */
export const KDF_MAX: Readonly<{ opslimit: number; memlimit: number }> = Object.freeze({
  opslimit: 8,
  memlimit: 536870912, // 512 MiB
})

/**
 * Parameters outside the bounds: `weak` below KDF_PARAMS, `heavy` above KDF_MAX.
 * Thrown before any derivation, so nothing derived from the secret is sent.
 */
export class KdfParamsError extends Error {
  readonly kind: 'weak' | 'heavy'
  constructor(kind: 'weak' | 'heavy', message: string) {
    super(message)
    this.name = 'KdfParamsError'
    this.kind = kind
  }
}

/**
 * Refuse parameters below the agreed ones or above KDF_MAX. Every derivation
 * reads its parameters from the server (GET /auth/login-params, recovery,
 * claim), so a tampered server could otherwise ask for a cost low enough that
 * the auth key it receives can be brute-forced offline into the password, and
 * from that the wrap key: the very thing the password split exists to stop.
 */
export function checkKdfParams(params: KdfParams): void {
  const { opslimit, memlimit } = params
  if (!Number.isInteger(opslimit) || !Number.isInteger(memlimit)) {
    throw new Error('Key derivation parameters are missing opslimit or memlimit.')
  }
  if (opslimit! < KDF_PARAMS.opslimit! || memlimit! < KDF_PARAMS.memlimit!) {
    throw new KdfParamsError(
      'weak',
      `Key derivation parameters below the agreed minimum (opslimit ${opslimit}, memlimit ${memlimit}; ` +
        `at least ${KDF_PARAMS.opslimit} and ${KDF_PARAMS.memlimit}). Refused.`,
    )
  }
  if (opslimit! > KDF_MAX.opslimit || memlimit! > KDF_MAX.memlimit) {
    throw new KdfParamsError(
      'heavy',
      `Key derivation parameters above what this client runs (opslimit ${opslimit}, memlimit ${memlimit}; ` +
        `at most ${KDF_MAX.opslimit} and ${KDF_MAX.memlimit}). Refused.`,
    )
  }
}

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
 * costs later still open, within bounds: anything but Argon2id is refused, and
 * so are costs below KDF_PARAMS or above KDF_MAX (checkKdfParams). Every
 * derivation in the client passes through here.
 *
 * Checked here, then run in a Web Worker where the browser has one (kdfRunner.ts,
 * kdf.worker.ts), so the page does not freeze for the second or two it takes;
 * on the main thread where there is none (the tests, in Node). The same bytes
 * either way. The caller still owns `secret` and wipes it.
 */
export async function deriveKey(secret: Uint8Array, saltB64: string, params: KdfParams): Promise<Uint8Array> {
  const s = await getSodium()
  if (params.kdf !== 'argon2id' || params.alg !== s.crypto_pwhash_ALG_ARGON2ID13) {
    throw new Error(`Unsupported key derivation: ${JSON.stringify(params)}`)
  }
  checkKdfParams(params)
  const salt = await fromBase64(saltB64)
  if (salt.length !== s.crypto_pwhash_SALTBYTES) throw new Error('Key derivation salt must be 16 bytes.')
  return argon2id(secret, salt, params.opslimit!, params.memlimit!, params.alg)
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
