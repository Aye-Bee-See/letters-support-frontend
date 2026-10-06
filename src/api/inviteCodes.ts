// Invite codes (README "Invite codes"): a group issues them in batches and hands
// them out as printed slips; a newcomer joins with one (auth.ts, joinWithCode).
// The group sees counts only, never who used a code. Group admins of an active
// group, and superadmins naming `chapter`.
import { del, getOne, post } from './client'
import type { InviteCodeSummary, IssuedInviteCodes } from '../types'

export interface IssueInviteCodes {
  /** 1 to 50. */
  count: number
  /** Up to 80 characters, shown in the batch list, e.g. "Letter night, 2 October". */
  label?: string
  /** A shorter life than the server's default (1 to INVITE_CODE_DAYS, 30 unless set). */
  days?: number
  /** Superadmins only. */
  chapter?: number
}

/**
 * POST /auth/invite-codes: the only time the server says the codes. A 409
 * InviteQuotaError when the batch would put the group over its limit of
 * outstanding codes (the numbers are in the error).
 */
export const issueInviteCodes = (input: IssueInviteCodes) => post<IssuedInviteCodes>('/auth/invite-codes', input)

/** GET /auth/invite-codes: the group's batches, newest first, with `outstanding` and `limit`. */
export const getInviteCodes = (chapter?: number) =>
  getOne<InviteCodeSummary>('/auth/invite-codes', chapter !== undefined ? { chapter } : undefined)

/**
 * DELETE /auth/invite-codes: cancel the unused codes of one batch, or every
 * unused code of the group. Used codes and the accounts made with them stay.
 */
export const cancelInviteCodes = (which: { batch: string } | { all: true }, chapter?: number) =>
  del<{ chapter: number; cancelled: number; outstanding: number }>('/auth/invite-codes', {
    ...which,
    ...(chapter !== undefined ? { chapter } : {}),
  })
