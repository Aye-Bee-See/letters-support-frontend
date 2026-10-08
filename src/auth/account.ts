import { setKeys } from '../api/auth'
import { toApiError } from '../api/client'
import { recoveryKeys, signInKeys, unlockAccount, type Keypair } from '../crypto'
import type { KdfParams, KeyBundle } from '../types'

// The signed-in account's own keys (README "End-to-end mode": "Account keys").
// Each change starts from the current password: it shows the person at the
// keyboard is the account holder, and it opens the private key to lock again.
// As at sign-in, the password goes through Argon2id with the account's own salt
// and parameters (from the session's key bundle) and never leaves the device.

/** The password typed as the current one does not open the account's private key. */
export class CurrentPasswordError extends Error {
  constructor() {
    super('That isn’t your current password. Check it and try again.')
  }
}

/** The key bundle's password-locked half, which a new recovery code leaves alone. */
interface PasswordLocked {
  publicKey: string
  wrappedPrivateKey: string
  kdfSalt: string
  kdfParams: KdfParams
}

function passwordLocked(keys: KeyBundle | null): PasswordLocked {
  if (!keys?.publicKey || !keys.wrappedPrivateKey || !keys.kdfSalt || !keys.kdfParams) {
    throw new Error('This session has no keys for your account. Sign out and sign in again.')
  }
  return { publicKey: keys.publicKey, wrappedPrivateKey: keys.wrappedPrivateKey, kdfSalt: keys.kdfSalt, kdfParams: keys.kdfParams }
}

/**
 * Open the private key with the current password: the wrap key is derived with
 * the account's existing salt and parameters, as at sign-in, and wiped after.
 * Throws CurrentPasswordError when it does not open (and KdfParamsError for a
 * bundle naming costs out of bounds).
 */
export async function openWithPassword(keys: KeyBundle | null, password: string): Promise<Keypair> {
  const locked = passwordLocked(keys)
  const { wrapKey } = await signInKeys(password, { scheme: 'split', kdfSalt: locked.kdfSalt, kdfParams: locked.kdfParams })
  try {
    return await unlockAccount(locked, wrapKey) // wipes wrapKey
  } catch {
    throw new CurrentPasswordError()
  }
}

/** A new recovery code, made on the device and not yet saved. */
export interface PreparedRecoveryCode {
  /** Show once, after `save` succeeds; the person confirms they saved it. */
  recoveryCode: string
  /**
   * PUT /auth/keys. Sends the same fields every time, so after a failure that
   * may or may not have reached the server it can simply be sent again.
   */
  save: () => Promise<void>
}

/**
 * A new recovery code: the private key locked under a fresh code, with its own
 * new salt. The password-locked fields go back exactly as they are: a split
 * account's salt changes only with its password (API #181), and sending them
 * makes the write hold only while the password is still the one this session
 * knows (a `409 KeyChangeError` if it changed meanwhile). Once saved, the old
 * recovery code stops working.
 */
export async function prepareRecoveryCode(keys: KeyBundle | null, password: string): Promise<PreparedRecoveryCode> {
  const locked = passwordLocked(keys)
  const keypair = await openWithPassword(keys, password)
  const rc = await recoveryKeys(keypair.privateKey)
  return {
    recoveryCode: rc.recoveryCode,
    save: async () => {
      await setKeys({ ...locked, ...rc.fields })
    },
  }
}

/**
 * The password (and with it the keys' salt) changed in another session while
 * this one still held the old values: `409 KeyChangeError`, or the API refusing
 * the salt this session sent as one that changes only with the password.
 * Signing in again loads the current ones.
 */
export function keysChangedElsewhere(err: unknown): boolean {
  const e = toApiError(err)
  if (e.status === 409 && e.name === 'KeyChangeError') return true
  return e.status === 400 && Boolean(e.problems?.some((p) => p.code === 'not_settable_here' && (p.field === 'kdfSalt' || p.field === 'kdfParams')))
}
