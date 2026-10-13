import { createUser } from '../api/users'
import { KDF_PARAMS, signInKeys, wipe } from '../crypto'
import type { KdfParams, User } from '../types'

// A staff account made by a site admin (README "Creating accounts with other
// roles"): a group admin or a site admin, with no pen name. The password the
// site admin types is split on this device, as at sign-in (README "Signing in
// without sending the password"), and never sent.

/** 16 random bytes as standard base64 with padding, the encoding the API uses. */
function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

export interface StaffAccountInput {
  username: string
  email: string
  name?: string
  role: 'chapter' | 'admin'
  /** The group, for a group admin. */
  chapterId?: number
  /** Typed by the site admin, given to the person once. Never sent. */
  password: string
}

/**
 * POST /auth/user for a staff account: a new salt, the auth key sent as the
 * password, and the salt and recipe with it so the person's devices derive the
 * same key. No keys are made here: a site admin must never hold anyone's
 * private key, so the account gets its keys at its first sign-in on a device
 * of its own.
 *
 * Server mode only. In end-to-end mode the API takes a split account's salt
 * only together with its keys (keys.controller keyFields, `newAccount`), so a
 * staff account can't be made here; an invitation makes one with its keys.
 */
export async function createStaffAccount(input: StaffAccountInput): Promise<User> {
  const kdfSalt = randomSalt()
  const kdfParams: KdfParams = { ...KDF_PARAMS }
  const { wrapKey, authKey } = await signInKeys(input.password, { scheme: 'split', kdfSalt, kdfParams })
  await wipe(wrapKey)
  return createUser({
    username: input.username,
    email: input.email,
    ...(input.name ? { name: input.name } : {}),
    role: input.role,
    ...(input.role === 'chapter' && input.chapterId ? { chapterId: input.chapterId } : {}),
    authScheme: 'split',
    password: authKey,
    kdfSalt,
    kdfParams,
  })
}
