// The UI says "group"; the API says "chapter" (/chapter).
import { getAllPages, getList, getOne, put } from './client'
import type { AccountStatus, Chapter, ChapterService, ListParams, RecordStatus } from '../types'

export interface GroupListParams extends ListParams {
  country?: string
  service?: ChapterService
  /** `both` groups match either; `both` itself is not a filter value (a 400). */
  networkRole?: 'collecting' | 'relay'
  accountStatus?: AccountStatus
  /** Staff only: draft, pending or published. Ignored for everyone else. */
  recordStatus?: RecordStatus
}

export const getGroups = (params?: GroupListParams) =>
  getList<Chapter>('/chapter/chapters', params)

/** Every group (every page). */
export const getAllGroups = (params?: Omit<GroupListParams, 'page' | 'page_size'>) =>
  getAllPages<Chapter>('/chapter/chapters', params)

/** full=true adds supported_prisoners and relay_prisons. */
export const getGroup = (id: number, full = true) =>
  getOne<Chapter>('/chapter/chapter', { id, full })

/**
 * Superadmin: change a group's record. accountStatus is admin-only. Approving a
 * group that joined by invitation is { accountStatus: 'active', recordStatus: 'published' }.
 * Group keys can't be set here (they have their own endpoints under /auth).
 */
export const updateGroup = (id: number, fields: Partial<Pick<Chapter, 'accountStatus' | 'recordStatus'>>) =>
  put<{ updatedRows: number }>('/chapter/chapter', { id, ...fields })
