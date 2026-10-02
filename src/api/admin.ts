// Superadmin-only calls: the dashboard counts and the moderation decisions. Every
// call here is a 403 for anyone else; the /admin routes are behind RequireAdmin.
import { getList, getOne, put } from './client'
import type { AdminSummary, AuditEntry, EncryptionReadiness, ListParams, Submission, User, UserRole } from '../types'

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
