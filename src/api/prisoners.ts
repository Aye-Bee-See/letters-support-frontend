import { getAllPages, getList, getOne } from './client'
import type { FilterValues, ListParams, Prisoner, PrisonerStatus, RecordStatus } from '../types'

export interface PrisonerListParams extends ListParams {
  status?: PrisonerStatus
  country?: string
  featured?: boolean
  /** Only prisoners held at this prison id. */
  prison?: number
  /** `true` only: never verified, or verified more than six months ago. Sending `false` is a 400. */
  stale?: true
  /** Staff only: draft, pending or published. Ignored for everyone else. */
  recordStatus?: RecordStatus
  /** Staff only: mail came back as transferred, released or undeliverable, and the record is unedited since. */
  addressInDoubt?: true
}

export const getPrisoners = (params?: PrisonerListParams) =>
  getList<Prisoner>('/prisoner/prisoners', params)

/** Every prisoner matching the filters (every page). */
export const getAllPrisoners = (params?: Omit<PrisonerListParams, 'page' | 'page_size'>) =>
  getAllPages<Prisoner>('/prisoner/prisoners', params)

/** The countries and statuses present, with counts, for the index's chips. */
export const getPrisonerFilters = () => getOne<FilterValues<'country' | 'status'>>('/prisoner/filters')

/** full=true adds the whole prison_details and support_groups. */
export const getPrisoner = (id: number, full = true) =>
  getOne<Prisoner>('/prisoner/prisoner', { id, full })

// Directory writes are superadmin-only (22 Sept). Group admins propose edits
// through corrections.ts instead. Admin write functions arrive with Step 7.
