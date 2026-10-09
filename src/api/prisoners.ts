import client, { del, getAllPages, getList, getOne, put } from './client'
import type { ApiEnvelope, FilterValues, HistoryEntry, ListParams, Prisoner, PrisonerPhoto, PrisonerStatus, RecordStatus } from '../types'

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
// through corrections.ts instead, except support links: a group admin links and
// unlinks their own active group (below).

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

/**
 * Link a support group to a prisoner, or change the link's description (the
 * same pair again). Takes effect at once; answers with the prisoner (full). A
 * superadmin links any group; a group admin only their own group, and only
 * while it is active (README "What each role can do"): another group's is a 403.
 */
export const linkSupportGroup = (prisoner: number, chapter: number, description: string | null) =>
  put<{ prisoner: Prisoner; chapter: number }>('/prisoner/support', { prisoner, chapter, description })

/** Remove a support link: the same people as linking. A 404 if there was none. */
export const unlinkSupportGroup = (prisoner: number, chapter: number) => del<number>('/prisoner/support', { prisoner, chapter })

// --- Photos (README "Photos") ---------------------------------------------------
// A superadmin, or any group admin of an active group (API #166). Published at
// once, without moderation, so the client asks first: a group admin confirms
// the person agreed to it; a superadmin names the public support page it comes
// from in `credit` (at most 200 characters, shown beside the picture). The API
// strips EXIF and the rest, orientation included, and never rotates.

/** The largest photo the API takes (`PHOTO_MAX_BYTES`, 5 MiB); it reads the type from the bytes. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

/**
 * POST /prisoner/photo, multipart: `prisoner` first, then the image in `photo`
 * (the API checks who is sending before reading the file), and `credit` only
 * when given. Replaces any photo the record had. A 400 names the problem on
 * `photo` (`not_allowed_value`, `out_of_range`, `wrong_type`).
 */
export async function uploadPrisonerPhoto(prisoner: number, file: Blob & { name?: string }, credit?: string | null) {
  const form = new FormData()
  form.append('prisoner', String(prisoner))
  if (credit) form.append('credit', credit)
  form.append('photo', file, file.name ?? 'photo')
  const response = await client.post<ApiEnvelope<{ id: number; photo: PrisonerPhoto; bytesStored: number; bytesUploaded: number }>>(
    '/prisoner/photo',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return response.data.data
}

/** DELETE /prisoner/photo: takes the photo off the record and deletes the file. The same people as adding one. */
export const removePrisonerPhoto = (prisoner: number) => del<unknown>('/prisoner/photo', { prisoner })

/**
 * GET /prisoner/history?id=: what happened to the record, newest first,
 * paginated (README "The history of one record"). Staff only; entries are
 * routine audit entries, kept 180 days by default.
 */
export const getPrisonerHistory = (id: number, params?: Pick<ListParams, 'page' | 'page_size'>) =>
  getList<HistoryEntry>('/prisoner/history', { id, ...params })
