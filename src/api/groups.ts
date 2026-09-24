// The UI says "group"; the API says "chapter" (/chapter).
import { getList, getOne } from './client'
import type { AccountStatus, Chapter, ChapterService, ListParams, NetworkRole } from '../types'

export interface GroupListParams extends ListParams {
  country?: string
  service?: ChapterService
  networkRole?: NetworkRole
  accountStatus?: AccountStatus
}

export const getGroups = (params?: GroupListParams) =>
  getList<Chapter>('/chapter/chapters', params)

/** full=true adds supported_prisoners and relay_prisons. */
export const getGroup = (id: number, full = true) =>
  getOne<Chapter>('/chapter/chapter', { id, full })
