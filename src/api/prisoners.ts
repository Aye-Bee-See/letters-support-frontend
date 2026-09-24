import { getList, getOne } from './client'
import type { ListParams, Prisoner, PrisonerStatus } from '../types'

export interface PrisonerListParams extends ListParams {
  status?: PrisonerStatus
  country?: string
  featured?: boolean
  /** Only prisoners held at this prison id. */
  prison?: number
  stale?: boolean
}

export const getPrisoners = (params?: PrisonerListParams) =>
  getList<Prisoner>('/prisoner/prisoners', params)

/** full=true adds the whole prison_details and support_groups. */
export const getPrisoner = (id: number, full = true) =>
  getOne<Prisoner>('/prisoner/prisoner', { id, full })

// Directory writes are superadmin-only (22 Sept). Group admins propose edits
// through corrections.ts instead. Admin write functions arrive with Step 7.
