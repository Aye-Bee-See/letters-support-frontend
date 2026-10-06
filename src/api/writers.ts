// Managed writers: accounts a group holds for people who write through it
// (README "Managed writers", and "Managed writers and claiming" under End-to-end
// mode). The writer's keypair and the claim token are made in the browser
// (src/crypto); these calls only carry the results.
import { del, getList, post, put } from './client'
import type { ClaimMaterial } from '../crypto'
import type { ListParams, User, Writer } from '../types'

/** A group gets its own unclaimed writers; an admin can pass { chapter: id }. */
export const getWriters = (params?: ListParams & { chapter?: number }) =>
  getList<Writer>('/auth/writers', params)

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
export const createWriter = (writer: NewWriter & { chapter?: number }) => post<User>('/auth/writer', writer)

/**
 * What a group may change on its own unclaimed writer through PUT /auth/user.
 * The group may rename a writer's pen name past the limits a writer has. A
 * keyless writer's first keys come as `publicKey` with `orgWrappedPrivateKey`
 * and `orgKeyVersion` together (README "Latecomers"), and only from a member
 * who holds the group key.
 */
export type WriterFields = Partial<Pick<User, 'name' | 'email' | 'managerNote' | 'penName'>> &
  ({ publicKey?: never } | { publicKey: string; orgWrappedPrivateKey: string; orgKeyVersion: number })

/** PUT /auth/user for an unclaimed writer of the caller's group. */
export const updateWriter = (id: number, fields: WriterFields) =>
  put<{ updatedRows: number[]; newUser: Partial<User> & { id: number } }>('/auth/user', { id, ...fields })

/**
 * DELETE /auth/user for an unclaimed writer of the caller's group: the account,
 * its letters, replies, attachments and threads all go. Answers what was removed.
 */
export const deleteWriter = (id: number) =>
  del<{ deleted: 1; letters: number; replies: number; attachments: number; threads: number }>('/auth/user', { id })

/**
 * POST /auth/writer/token with the material from createClaimToken (src/crypto):
 * the hash of the token and the writer's private key locked under it. The
 * server never learns the token, so the answer has none: show ClaimMaterial.token
 * once, with this `expiresAt`. Issuing again replaces the live token. 409
 * ClaimError for the group's anonymous writer, which can never be claimed.
 */
export const issueClaimToken = (writer: number, fields: ClaimMaterial['fields']) =>
  post<{ writer: number; expiresAt: string }>('/auth/writer/token', { writer, ...fields })

/** DELETE /auth/writer/token: revoke the live claim token. A 404 if there is none. */
export const revokeClaimToken = (writer: number) => del<number>('/auth/writer/token', { writer })
