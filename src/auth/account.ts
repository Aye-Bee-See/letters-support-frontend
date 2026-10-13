import { deleteMyAccount, setKeys, setSplitPassword } from '../api/auth'
import { toApiError } from '../api/client'
import type { DeletedAccount } from '../api/users'
import { passwordKeys, recoveryKeys, signInKeys, unlockAccount, type Keypair, type PasswordKeyFields } from '../crypto'
import type { ApiError, KdfParams, KeyBundle } from '../types'
import { commonRefusal, otherRefusal } from '../utils/refusals'

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
  return (await openAndAuthKey(keys, password)).keypair
}

/** openWithPassword, keeping the auth key the same run derived: what the API checks as the password. */
async function openAndAuthKey(keys: KeyBundle | null, password: string): Promise<{ keypair: Keypair; authKey: string }> {
  const locked = passwordLocked(keys)
  const { wrapKey, authKey } = await signInKeys(password, { scheme: 'split', kdfSalt: locked.kdfSalt, kdfParams: locked.kdfParams })
  try {
    return { keypair: await unlockAccount(locked, wrapKey), authKey } // wipes wrapKey
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

export interface PasswordChanged {
  /** This session's new token: the change ended every session, this one's old token included. Null if the API sent none. */
  token: { token: string; expires: number } | null
  /** The private key re-wrapped under the new password, for the session's key bundle. */
  fields: PasswordKeyFields
}

/**
 * Change the password (PUT /auth/user, split): the current password opens the
 * private key, which is locked under the new one with a new salt, and only the
 * new auth key and the locked copy are sent. The keypair and the recovery code
 * stay as they are. Every other session of the account ends.
 */
export async function changePassword(userId: number, keys: KeyBundle | null, current: string, next: string): Promise<PasswordChanged> {
  const keypair = await openWithPassword(keys, current)
  const { authKey, fields } = await passwordKeys(keypair.privateKey, next)
  const answer = await setSplitPassword(userId, { authKey, ...fields })
  return { token: answer?.token ?? null, fields }
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

/**
 * Delete the signed-in account (DELETE /auth/user, README "DELETE /auth/user"):
 * the current password must open the private key here first, so a mistyped one
 * is caught on the device and never spends one of the API's limited tries.
 * Then the auth key the same Argon2id run derived goes as `password`, as at
 * sign-in. Throws CurrentPasswordError before sending anything, or the
 * ApiError; on success every token of the account has stopped working.
 */
export async function deleteOwnAccount(userId: number, keys: KeyBundle | null, password: string): Promise<DeletedAccount> {
  const { authKey } = await openAndAuthKey(keys, password)
  return deleteMyAccount(userId, authKey)
}

/**
 * Why the API refused to delete the signed-in account, to the account holder
 * (`409 AccountDeleteError` conditions from the API's erase-account.js; the
 * site admin's own wording of them is utils/users.ts deleteRefusal). The 403
 * is the password, checked again on the server, and comes before
 * commonRefusal, which would read a bare 403 as a group that isn't active.
 */
export function ownDeleteRefusal(error: ApiError): string {
  if (error.status === 403) return 'The server says that isn’t your current password, so nothing was deleted. Check it and try again.'
  if (error.status === 409 && error.name === 'AccountDeleteError') {
    switch (error.condition) {
      case 'group_owner':
        return 'You’re your group’s group-owner admin, and the group has other group admins. Pass ownership to one of them first, on your group’s keys page; then you can delete your account. Nothing was deleted.'
      case 'last_key_holder':
        return 'You’re the last group admin holding your group’s key. Hand the key to another group admin first, on your group’s keys page, or your group could never read its letters again. Nothing was deleted.'
      case 'only_admin':
        return 'This is the only site admin account. Make another account a site admin first, or nobody could run the site. Nothing was deleted.'
      case 'anonymous':
        return 'This is a group’s shared anonymous account, and it goes only with the group. Nothing was deleted.'
    }
    return 'The server won’t delete this account yet, and didn’t say why in a way this page knows. Nothing was deleted.'
  }
  if (error.status === 0) return 'The server couldn’t be reached, so we can’t tell whether your account was deleted. Try again: if it was, you’ll be signed out.'
  return commonRefusal(error) ?? otherRefusal(error)
}

/** A refusal about the group's ownership or key, which the group's keys page puts right. */
export const fixedOnGroupKeysPage = (error: ApiError) =>
  error.status === 409 && error.name === 'AccountDeleteError' && (error.condition === 'group_owner' || error.condition === 'last_key_holder')
