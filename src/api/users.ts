// Accounts, for a site admin (README "Users"). Every call here is a 403 for
// anyone else; the /admin routes are behind RequireAdmin. Letters are never
// part of an account record, and nothing here can read one.
import { del, getList, getOne, post, put } from './client'
import { KDF_PARAMS, signInKeys, wipe } from '../crypto'
import type { KdfParams, ListParams, User, UserRole } from '../types'

export interface UserListParams extends ListParams {
  role?: UserRole
}

/** GET /auth/users: by `role`, and `q` over username, email and name; oldest first. */
export const getUsers = (params?: UserListParams) => getList<User>('/auth/users', params)

/** GET /auth/user?id= */
export const getUser = (id: number) => getOne<User>('/auth/user', { id })

/**
 * PUT /auth/user { id, role, chapterId? }. `banned` ends every session at once
 * (the API refuses a banned account's token on every request). An account made
 * anything but a group admin stops owning its group, and the group is told.
 */
export const setUserRole = (id: number, role: UserRole, chapterId?: number | null) =>
  put<{ updatedRows: number[] }>('/auth/user', { id, role, ...(chapterId !== undefined ? { chapterId } : {}) })

/** PUT /auth/user { id, chapterId }: put a group admin in a group, or (null) take them out. */
export const setUserGroup = (id: number, chapterId: number | null) => put<{ updatedRows: number[] }>('/auth/user', { id, chapterId })

/** POST /auth/revoke { user }: every token of the account stops working; it can sign in again at once. */
export const revokeSessions = (user: number) => post<{ user: number; sessionsRevokedAt: string }>('/auth/revoke', { user })

/** What DELETE /auth/user took with the account. */
export interface DeletedAccount {
  deleted: 1
  letters: number
  replies: number
  attachments: number
  threads: number
}

/**
 * DELETE /auth/user { id }: the account and everything written or received
 * through it. A site admin needs no password for someone else's. 409
 * AccountDeleteError while something stands in the way (utils/users.ts).
 */
export const deleteUser = (id: number) => del<DeletedAccount>('/auth/user', { id })

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
 * POST /auth/user for a staff account, which needs no pen name. The password
 * is split on this device, as at sign-in (README "Signing in without sending
 * the password"): a new salt, the auth key sent as the password, and the salt
 * and recipe with it so the person's devices derive the same key. No keys are
 * made here: a site admin must never hold anyone's private key, so the account
 * gets its keys at its first sign-in on a device of its own.
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
  return post<User>('/auth/user', {
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
