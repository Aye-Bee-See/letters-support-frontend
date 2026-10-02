// The UI says "group"; the API says "chapter" (/chapter).
import { del, getAllPages, getList, getOne, put } from './client'
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

/** The fields PUT /chapter/chapter accepts (CHAPTER_FIELDS in the API). lettersSent and averageTimeDays are counted, not set. */
export type GroupFields = Partial<
  Pick<
    Chapter,
    | 'name' | 'location' | 'subregion' | 'country' | 'about' | 'website' | 'email' | 'socialLinks' | 'services'
    | 'announcement' | 'networkRole' | 'accountStatus' | 'vouchedBy' | 'lettersSentBefore' | 'recordStatus'
  >
>

/**
 * Superadmin: change a group's record. Send just the fields that changed.
 * accountStatus is admin-only. Approving a group that joined by invitation is
 * { accountStatus: 'active', recordStatus: 'published' }. Group keys can't be
 * set here (they have their own endpoints under /auth).
 */
export const updateGroup = (id: number, fields: GroupFields) => put<{ updatedRows: number }>('/chapter/chapter', { id, ...fields })

/**
 * Superadmin: delete a group. Never refused, and far-reaching: members and
 * managed writers lose their group, letters lose their relay group, and its
 * invite codes, invitations and member keys go with it. Suspending is usually what's wanted.
 */
export const deleteGroup = (id: number) => del<number>('/chapter/chapter', { id })
