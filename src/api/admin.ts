// Superadmin-only calls: the dashboard counts and the moderation decisions. Every
// call here is a 403 for anyone else; the /admin routes are behind RequireAdmin.
import { getList, getOne, put } from './client'
import type { AdminSummary, AuditEntry, BanRecommendation, EncryptionReadiness, ListParams, Submission, User, UserRole } from '../types'

export const getAdminSummary = () => getOne<AdminSummary>('/moderation/summary')

export const getEncryptionReadiness = () => getOne<EncryptionReadiness>('/auth/encryption-readiness')

export const getAuditLog = (params?: ListParams & { actor?: number; action?: string; resource?: string; target?: number }) =>
  getList<AuditEntry>('/moderation/audit', params)

export interface ApproveInput {
  id: number
  /** Reviewer edits merged over the proposal; may include reviewer-only fields such as verifiedAt. */
  fields?: Record<string, unknown>
  decisionNote?: string
  /** The submission's updatedAt as reviewed: a 409 SubmissionChangedError if the submitter revised it since. */
  ifUnchangedSince?: string
}

export const approveSubmission = (input: ApproveInput) => put<Submission>('/moderation/approve', input)

/** The note is required: the submitter is told why. */
export const rejectSubmission = (id: number, decisionNote: string) => put<Submission>('/moderation/reject', { id, decisionNote })

/** Superadmin: accounts by username, email or name (GET /auth/users). */
export const searchAccounts = (q: string, params?: ListParams & { role?: UserRole }) =>
  getList<User>('/auth/users', { q, page_size: 10, ...params })

/** Site-wide ban recommendations from groups (API #172). A group reads its own with the same call, so it lives in moderation.ts. */
export { getBanRecommendations } from './moderation'

/**
 * Decide one. `ban` gives the writer the banned role (every session ends at once)
 * and settles every recommendation still waiting for them, from any group, as
 * banned; `dismiss` settles this one. `note` (at most 500 characters) goes back
 * to the recommending group. A 409 (decided) if someone decided it first.
 */
export const decideBanRecommendation = (id: number, decision: 'ban' | 'dismiss', note?: string) =>
  put<BanRecommendation>('/moderation/ban-recommendation', { id, decision, ...(note ? { note } : {}) })
