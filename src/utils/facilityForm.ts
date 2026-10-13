import type { FacilityFields } from '../api/facilities'
import type { MailRuleList, Prison, PrisonAddress, RecordStatus, RoutingMethod } from '../types'
import { ROUTING_LABELS } from './facilities'

// The facility record as a form: shared by the site admin's New and Edit pages
// (pages/admin/NewFacility.tsx, EditFacility.tsx), with the rule picker in
// components/admin/RulePicker.tsx. `toRecord` is the body for a new record (only
// what was filled in); `changes` the body for an edit (only what changed, blank
// text and limits as null). `address` is one JSON value, so it goes whole. Who
// verified it (verifiedAt, verifiedBy) stays with each page.

export const ROUTINGS = Object.keys(ROUTING_LABELS) as RoutingMethod[]
/** The record statuses in a record's order of life; the prisoner and group forms list them so too. */
export const RECORD_STATUSES: RecordStatus[] = ['draft', 'pending', 'published']
/** An envelope takes at most this many print lines (PrisonAddress.lines: 1 to 8). */
export const MAX_PRINT_LINES = 8
/** address keys the form edits; any others the record has are kept as they are. */
const ADDRESS_KEYS = ['street', 'city', 'postalCode', 'lines']
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })

export interface FacilityFormValues {
  prisonName: string
  street: string
  city: string
  postalCode: string
  /** One print line per line of text. */
  lines: string
  country: string
  routing: string
  scanService: string
  pageLimit: string
  photoLimit: string
  /** Two-letter codes, separated by commas or spaces. */
  mailLanguages: string
  notes: string
  recordStatus: RecordStatus
  verificationNotes: string
}

/** A new record's form: a draft unless chosen otherwise. */
export const EMPTY_FACILITY: FacilityFormValues = {
  prisonName: '', street: '', city: '', postalCode: '', lines: '', country: '', routing: '', scanService: '', pageLimit: '',
  photoLimit: '', mailLanguages: '', notes: '', recordStatus: 'draft', verificationNotes: '',
}

export const toLines = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
export const toCodes = (text: string) =>
  text
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)

/** The languages typed so far, by name ("English, Spanish"); blank while none is a code yet. */
export const languageHint = (text: string) =>
  toCodes(text)
    .filter((c) => /^[a-z]{2}$/.test(c))
    .map((c) => languageNames.of(c) ?? c)
    .join(', ')

export function toForm(f: Prison): FacilityFormValues {
  const a = f.address ?? {}
  return {
    prisonName: f.prisonName,
    street: a.street ?? '',
    city: a.city ?? '',
    postalCode: a.postalCode ?? '',
    lines: (a.lines ?? []).join('\n'),
    country: f.country ?? '',
    routing: f.routing ?? '',
    scanService: f.scanService ?? '',
    pageLimit: f.pageLimit !== null ? String(f.pageLimit) : '',
    photoLimit: f.photoLimit !== null ? String(f.photoLimit) : '',
    mailLanguages: (f.mailLanguages ?? []).join(', '),
    notes: f.notes ?? '',
    recordStatus: f.recordStatus ?? 'published',
    verificationNotes: f.verificationNotes ?? '',
  }
}

/** The address as the form would save it: the record's other keys kept, blank fields dropped. */
export function buildAddress(original: PrisonAddress, v: FacilityFormValues): PrisonAddress {
  const out: PrisonAddress = Object.fromEntries(Object.entries(original).filter(([key]) => !ADDRESS_KEYS.includes(key)))
  if (v.street.trim()) out.street = v.street.trim()
  if (v.city.trim()) out.city = v.city.trim()
  if (v.postalCode.trim()) out.postalCode = v.postalCode.trim()
  const lines = toLines(v.lines)
  if (lines.length) out.lines = lines
  return out
}

/** Problems the API would refuse, and an address nobody could mail to, said before the request. */
export function problems(v: FacilityFormValues, rules: Set<string>, list: MailRuleList | null): string[] {
  const out: string[] = []
  if (!v.prisonName.trim()) out.push('The facility needs a name.')
  if (!v.city.trim() && !toLines(v.lines).length) out.push('Give the address: at least the city, or the lines to print on an envelope.')
  if (toLines(v.lines).length > MAX_PRINT_LINES) out.push(`An envelope takes at most ${MAX_PRINT_LINES} print lines.`)
  for (const [key, label] of [['pageLimit', 'Page limit'], ['photoLimit', 'Photo limit']] as const) {
    const raw = v[key].trim()
    // isSafeInteger, not just digits: a long enough digit string is Infinity (sent as
    // null, i.e. "no limit") or loses precision on the way to JSON.
    if (raw && !(/^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) >= 1))
      out.push(`${label} must be a whole number of at least 1, or blank for no limit.`)
  }
  // The API refuses a photo limit on a facility that takes no photos at all.
  if (v.photoLimit.trim() && rules.has('no_photos')) {
    const label = list?.rules.find((r) => r.tag === 'no_photos')?.label ?? 'No photos'
    out.push(`A facility with “${label}” takes no photos, so it can’t have a photo limit: clear one or the other.`)
  }
  const codes = toCodes(v.mailLanguages)
  const bad = codes.filter((c) => !/^[a-z]{2}$/.test(c))
  if (bad.length) out.push(`Languages are two-letter codes, like en or es: ${bad.join(', ')} isn't one.`)
  if (new Set(codes).size !== codes.length) out.push('A language is listed twice.')
  for (const [a, b] of list?.conflicts ?? []) {
    if (rules.has(a) && rules.has(b)) {
      const label = (tag: string) => list?.rules.find((r) => r.tag === tag)?.label ?? tag
      out.push(`“${label(a)}” and “${label(b)}” can’t both apply.`)
    }
  }
  return out
}

/** The chosen rules in master-list order; any the list doesn't have go last. */
export function sortRules(rules: Set<string>, list: MailRuleList | null): string[] {
  const order = list?.rules.map((r) => r.tag) ?? []
  return [...rules].sort((a, b) => (order.indexOf(a) + 1 || Infinity) - (order.indexOf(b) + 1 || Infinity))
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** The API body for a new record (POST /prison/prison): only what was filled in. */
export function toRecord(v: FacilityFormValues, rules: Set<string>, list: MailRuleList | null): FacilityFields & { prisonName: string; address: PrisonAddress } {
  const out: FacilityFields & { prisonName: string; address: PrisonAddress } = {
    prisonName: v.prisonName.trim(),
    address: buildAddress({}, v),
    recordStatus: v.recordStatus,
  }
  for (const key of ['country', 'scanService', 'notes', 'verificationNotes'] as const) if (v[key].trim()) out[key] = v[key].trim()
  if (v.routing) out.routing = v.routing as RoutingMethod
  for (const key of ['pageLimit', 'photoLimit'] as const) if (v[key].trim()) out[key] = Number(v[key])
  if (toCodes(v.mailLanguages).length) out.mailLanguages = toCodes(v.mailLanguages)
  if (rules.size) out.mailRules = sortRules(rules, list)
  return out
}

/** The API body for what changed (PUT /prison/prison). Blank text and limits are null. */
export function changes(f: Prison, initial: FacilityFormValues, v: FacilityFormValues, rules: Set<string>, list: MailRuleList | null): FacilityFields {
  const out: FacilityFields = {}
  const text = (s: string) => s.trim() || null
  if (v.prisonName.trim() !== initial.prisonName.trim()) out.prisonName = v.prisonName.trim()
  for (const key of ['country', 'scanService', 'notes', 'verificationNotes'] as const)
    if (v[key].trim() !== initial[key].trim()) out[key] = text(v[key])
  if (v.routing !== initial.routing) out.routing = (v.routing || null) as RoutingMethod | null
  if (v.recordStatus !== initial.recordStatus) out.recordStatus = v.recordStatus
  for (const key of ['pageLimit', 'photoLimit'] as const)
    if (v[key].trim() !== initial[key].trim()) out[key] = v[key].trim() ? Number(v[key]) : null
  const codes = toCodes(v.mailLanguages)
  if (!sameList(codes, toCodes(initial.mailLanguages))) out.mailLanguages = codes.length ? codes : null
  const address = buildAddress(f.address ?? {}, v)
  if (JSON.stringify(address) !== JSON.stringify(buildAddress(f.address ?? {}, initial))) out.address = address
  const sorted = sortRules(rules, list)
  if (!sameList([...sorted].sort(), [...(f.mailRules ?? [])].sort())) out.mailRules = sorted
  return out
}
