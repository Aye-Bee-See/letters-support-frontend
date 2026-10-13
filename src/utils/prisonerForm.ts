import type { PrisonerFields } from '../api/prisoners'
import type { Prison, Prisoner, PrisonerStatus, RecordStatus } from '../types'

// The prisoner record as a form: shared by the site admin's New and Edit pages
// (pages/admin/NewPrisoner.tsx, EditPrisoner.tsx). `toRecord` is the body for a
// new record (only what was filled in); `changes` the body for an edit (only
// what changed, blank text as null), so the audit log says what was edited.
// Lists are arrays, dates YYYY-MM-DD. Who verified it (verifiedAt, verifiedBy)
// stays with each page.

export { RECORD_STATUSES } from './facilityForm'
export const PRISONER_STATUSES: PrisonerStatus[] = ['incarcerated', 'pretrial', 'free']

/** The form's values: every field as the inputs hold it. */
export interface PrisonerFormValues {
  chosenName: string
  birthName: string
  /** One per line. */
  aliases: string
  status: string
  /** The facility's id, or blank. */
  prison: string
  country: string
  inmateID: string
  detainedSince: string
  releaseDate: string
  estimatedRelease: string
  sentence: string
  charges: string
  statusNotice: string
  bio: string
  /** One per line. */
  interests: string
  supportWebsite: string
  donationInfo: string
  recordStatus: RecordStatus
  featured: boolean
  verificationNotes: string
}

/** A new record's form: a draft unless chosen otherwise. */
export const EMPTY_PRISONER: PrisonerFormValues = {
  chosenName: '', birthName: '', aliases: '', status: '', prison: '', country: '', inmateID: '', detainedSince: '', releaseDate: '',
  estimatedRelease: '', sentence: '', charges: '', statusNotice: '', bio: '', interests: '', supportWebsite: '', donationInfo: '',
  recordStatus: 'draft', featured: false, verificationNotes: '',
}

const TEXT_FIELDS = [
  'chosenName', 'birthName', 'country', 'inmateID', 'estimatedRelease', 'sentence', 'charges',
  'statusNotice', 'bio', 'supportWebsite', 'donationInfo', 'verificationNotes',
] as const

/** A facility as the picker and the chosen line name it: an unpublished one is marked. */
export const facilityLabel = (f: Prison) =>
  `${f.prisonName}${f.country ? ` (${f.country})` : ''}${f.recordStatus && f.recordStatus !== 'published' ? ` [${f.recordStatus}]` : ''}`

/** A date input holds YYYY-MM-DD; the API stores a timestamp. Read it in UTC, as the public pages show it. */
function dateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}
const lines = (list: string[] | null) => (list ?? []).join('\n')
export const toList = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

export function toForm(p: Prisoner): PrisonerFormValues {
  return {
    chosenName: p.chosenName ?? '',
    birthName: p.birthName ?? '',
    aliases: lines(p.aliases),
    status: p.status ?? '',
    prison: p.prison !== null ? String(p.prison) : '',
    country: p.country ?? '',
    inmateID: p.inmateID ?? '',
    detainedSince: dateInput(p.detainedSince),
    releaseDate: dateInput(p.releaseDate),
    estimatedRelease: p.estimatedRelease ?? '',
    sentence: p.sentence ?? '',
    charges: p.charges ?? '',
    statusNotice: p.statusNotice ?? '',
    bio: p.bio ?? '',
    interests: lines(p.interests),
    supportWebsite: p.supportWebsite ?? '',
    donationInfo: p.donationInfo ?? '',
    recordStatus: p.recordStatus ?? 'published',
    featured: p.featured,
    verificationNotes: p.verificationNotes ?? '',
  }
}

/** What the API would refuse, or what would make a record nobody can find, said before sending. */
export function problems(v: PrisonerFormValues): string[] {
  const out: string[] = []
  if (!v.chosenName.trim() && !v.birthName.trim()) out.push('The record needs a name: a chosen name, a birth name, or both.')
  if (v.supportWebsite.trim() && !/^https?:\/\/\S+\.\S+/.test(v.supportWebsite.trim())) out.push('The support website must be a full address, starting with https://.')
  return out
}

/** The API body for a new record (POST /prisoner/prisoner): only what was filled in. */
export function toRecord(v: PrisonerFormValues): PrisonerFields {
  const out: Record<string, unknown> = { recordStatus: v.recordStatus }
  for (const key of TEXT_FIELDS) if (v[key].trim()) out[key] = v[key].trim()
  for (const key of ['aliases', 'interests'] as const) if (toList(v[key]).length) out[key] = toList(v[key])
  for (const key of ['detainedSince', 'releaseDate'] as const) if (v[key]) out[key] = v[key]
  if (v.status) out.status = v.status
  if (v.prison) out.prison = Number(v.prison)
  if (v.featured) out.featured = true
  return out as PrisonerFields
}

/** The API body for what changed (PUT /prisoner/prisoner): blank text is null, an emptied list an empty array. */
export function changes(before: PrisonerFormValues, after: PrisonerFormValues): PrisonerFields {
  const out: Record<string, unknown> = {}
  const text = (v: string) => v.trim() || null
  for (const key of TEXT_FIELDS) if (before[key].trim() !== after[key].trim()) out[key] = text(after[key])
  for (const key of ['aliases', 'interests'] as const)
    if (lines(toList(before[key])) !== lines(toList(after[key]))) out[key] = toList(after[key])
  for (const key of ['detainedSince', 'releaseDate'] as const) if (before[key] !== after[key]) out[key] = after[key] || null
  if (before.status !== after.status) out.status = after.status || null
  if (before.prison !== after.prison) out.prison = after.prison ? Number(after.prison) : null
  if (before.recordStatus !== after.recordStatus) out.recordStatus = after.recordStatus
  if (before.featured !== after.featured) out.featured = after.featured
  return out as PrisonerFields
}
