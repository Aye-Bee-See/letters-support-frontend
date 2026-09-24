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

/**
 * Every prisoner matching `params`, following pages (the API caps page_size at
 * 100). The directory is expected to stay in the low hundreds, so the index
 * loads it whole and filters in the browser.
 */
export async function getAllPrisoners(params?: Omit<PrisonerListParams, 'page' | 'page_size'>): Promise<Prisoner[]> {
  const all: Prisoner[] = []
  for (let page = 1; ; page++) {
    const result = await getPrisoners({ ...params, page, page_size: 100 })
    all.push(...result.items)
    if (all.length >= result.total || result.items.length === 0) return all
  }
}

/** full=true adds the whole prison_details and support_groups. */
export const getPrisoner = (id: number, full = true) =>
  getOne<Prisoner>('/prisoner/prisoner', { id, full })

// Directory writes are superadmin-only (22 Sept). Group admins propose edits
// through corrections.ts instead. Admin write functions arrive with Step 7.
