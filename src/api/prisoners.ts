import { del, getAllPages, getList, getOne, put } from './client'
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
// through corrections.ts instead.

/** The fields PUT /prisoner/prisoner accepts (PRISONER_FIELDS in the API). */
export type PrisonerFields = Partial<
  Pick<
    Prisoner,
    | 'birthName' | 'chosenName' | 'aliases' | 'prison' | 'country' | 'inmateID' | 'releaseDate' | 'detainedSince'
    | 'sentence' | 'charges' | 'estimatedRelease' | 'bio' | 'interests' | 'supportWebsite' | 'donationInfo'
    | 'status' | 'statusNotice' | 'featured' | 'verifiedBy' | 'verifiedAt' | 'verificationNotes' | 'recordStatus'
  >
>

/** What an edit did to the prisoner's mail, when it moved or freed them. */
export interface PrisonerMailChange {
  moved: boolean
  freed: boolean
  /** Queued letters sent on to the new facility's relay group. */
  rerouted: number
  /** Letters this edit newly held (e.g. no relay group for the new facility). */
  held: number
  /** Letters this edit let go. */
  released: number
}

/** Superadmin only. Send just the fields that changed: the audit log records what was sent. */
export const updatePrisoner = (id: number, fields: PrisonerFields) =>
  put<{ updatedRows: number; mail?: PrisonerMailChange }>('/prisoner/prisoner', { id, ...fields })

/** Superadmin only. Refused while letter threads point at the prisoner (a 400, SequelizeForeignKeyConstraintError). */
export const deletePrisoner = (id: number) => del<number>('/prisoner/prisoner', { id })

/** Link a support group to a prisoner, or change the link's description (the same pair again). Takes effect at once. */
export const linkSupportGroup = (prisoner: number, chapter: number, description: string | null) =>
  put<unknown>('/prisoner/support', { prisoner, chapter, description })

/** Remove a support link. A 404 if there was none. */
export const unlinkSupportGroup = (prisoner: number, chapter: number) => del<number>('/prisoner/support', { prisoner, chapter })
