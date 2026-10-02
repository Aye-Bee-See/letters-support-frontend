// Superadmin-only reads for the admin dashboard. Every call here is a 403 for
// anyone else; the /admin routes are behind RequireAdmin.
import { getList, getOne } from './client'
import type { AdminSummary, AuditEntry, EncryptionReadiness, ListParams } from '../types'

export const getAdminSummary = () => getOne<AdminSummary>('/moderation/summary')

export const getEncryptionReadiness = () => getOne<EncryptionReadiness>('/auth/encryption-readiness')

export const getAuditLog = (params?: ListParams & { actor?: number; action?: string; resource?: string; target?: number }) =>
  getList<AuditEntry>('/moderation/audit', params)
