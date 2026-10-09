// Managed writers: accounts a group holds for people who write through it
// (README "Managed writers", and "Managed writers and claiming" under End-to-end
// mode). The writer's keypair and the claim token are made in the browser
// (src/crypto); these calls only carry the results.
import { del, getAllPages, post, put } from './client'
import type { ClaimMaterial } from '../crypto'
import type { CaughtUp } from './groups'
import type { User, Writer } from '../types'

/**
 * Every page of GET /auth/writers: a group gets its own unclaimed writers, an
 * admin can pass { chapter: id }. The one call that returns a writer's
 * `orgWrappedPrivateKey` to the managing group (GET /auth/user strips key
 * columns), so pages about one writer find them here by id.
 */
export const getAllWriters = (params?: { chapter?: number; q?: string }) => getAllPages<Writer>('/auth/writers', params)

/** How long getCachedWriters keeps the list. */
const WRITERS_FRESH_MS = 60_000
let writersCache: { account: number; at: number; rows: Promise<Writer[]> } | null = null

/**
 * The signed-in group's writers (getAllWriters), kept for a minute for that
 * account: the pages about one writer (hand-off, edit) each need one row of
 * it, and GET /auth/user strips the keys they need. Any writer change made
 * through this module, and a group key rotation, forgets it; a failed fetch
 * isn't kept.
 */
export function getCachedWriters(account: number): Promise<Writer[]> {
  const now = Date.now()
  if (writersCache && writersCache.account === account && now - writersCache.at < WRITERS_FRESH_MS) return writersCache.rows
  const rows = getAllWriters()
  const entry = { account, at: now, rows }
  writersCache = entry
  rows.catch(() => {
    if (writersCache === entry) writersCache = null
  })
  return rows
}

/** Drop the kept list, so the next getCachedWriters asks again. */
export function forgetWriters() {
  writersCache = null
}

/** Run a writer change, then forget the kept list whether it worked or not. */
function changing<T>(request: Promise<T>): Promise<T> {
  return request.finally(forgetWriters)
}

export interface NewWriter {
  /** Required, 3 to 32 characters. */
  name: string
  /** Optional; without one the API stores a placeholder ending in @managed.example. */
  email?: string
  /** For the group only. */
  managerNote?: string
  /** The name the writer signs with; they keep it when they claim the account unless they choose another. */
  penName?: string
  /** End-to-end mode: the writer's new public key. */
  publicKey: string
  /** End-to-end mode: the writer's private key sealed to the group's public key. */
  orgWrappedPrivateKey: string
  /** The keyVersion of the group key it was sealed to: a 409 KeyVersionError if the group rotated meanwhile. */
  orgKeyVersion: number
}

/** POST /auth/writer: a managed writer in the caller's own group (a superadmin adds `chapter`). */
export const createWriter = (writer: NewWriter & { chapter?: number }) => changing(post<User>('/auth/writer', writer))

/**
 * What a group may change on its own unclaimed writer through PUT /auth/user.
 * The group may rename a writer's pen name past the limits a writer has. A
 * keyless writer's first keys come as `publicKey` with `orgWrappedPrivateKey`
 * and `orgKeyVersion` together (README "Latecomers"), and only from a member
 * who holds the group key.
 */
export type WriterFields = Partial<Pick<User, 'name' | 'email' | 'managerNote' | 'penName'>> &
  ({ publicKey?: never } | { publicKey: string; orgWrappedPrivateKey: string; orgKeyVersion: number })

/**
 * PUT /auth/user for an unclaimed writer of the caller's group. Giving the
 * writer their first keys answers `caughtUp` too, the letters the server then
 * sealed to them (README "Latecomers", API #194); any other edit has none.
 */
export const updateWriter = (id: number, fields: WriterFields) =>
  changing(put<{ updatedRows: number[]; newUser: Partial<User> & { id: number }; caughtUp?: CaughtUp }>('/auth/user', { id, ...fields }))

/**
 * DELETE /auth/user for an unclaimed writer of the caller's group: the account,
 * its letters, replies, attachments and threads all go. Answers what was removed.
 */
export const deleteWriter = (id: number) =>
  changing(del<{ deleted: 1; letters: number; replies: number; attachments: number; threads: number }>('/auth/user', { id }))

/**
 * POST /auth/writer/token with the material from createClaimToken (src/crypto):
 * the hash of the token and the writer's private key locked under it. The
 * server never learns the token, so the answer has none: show ClaimMaterial.token
 * once, with this `expiresAt`. Issuing again replaces the live token. 409
 * ClaimError for the group's anonymous writer, which can never be claimed.
 */
export const issueClaimToken = (writer: number, fields: ClaimMaterial['fields']) =>
  changing(post<{ writer: number; expiresAt: string }>('/auth/writer/token', { writer, ...fields }))

/** DELETE /auth/writer/token: revoke the live claim token. A 404 if there is none. */
export const revokeClaimToken = (writer: number) => changing(del<number>('/auth/writer/token', { writer }))
