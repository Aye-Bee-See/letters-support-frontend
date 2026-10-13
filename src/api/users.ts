// Accounts, for a site admin (README "Users"). Every call here is a 403 for
// anyone else; the /admin routes are behind RequireAdmin. Letters are never
// part of an account record, and nothing here can read one.
import { del, getList, getOne, post, put } from './client'
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

/** What POST /auth/user takes for a staff account made split; src/auth/staffAccount.ts derives the keys in it. */
export interface NewStaffAccount {
  username: string
  email: string
  name?: string
  role: 'chapter' | 'admin'
  chapterId?: number
  authScheme: 'split'
  /** The auth key, sent in the password's place. */
  password: string
  kdfSalt: string
  kdfParams: KdfParams
}

/** POST /auth/user: an account made by a site admin. */
export const createUser = (body: NewStaffAccount) => post<User>('/auth/user', body)

