// The UI says "facility"; the API says "prison" (/prison).
import { del, getAllPages, getList, getOne, put } from './client'
import type { FilterValues, ListParams, MailRuleList, Prison, RecordStatus, RoutingMethod } from '../types'
import { post } from './client'
import type { HistoryEntry, MailRule, MailRuleCategory } from '../types'

export interface FacilityListParams extends ListParams {
  country?: string
  routing?: RoutingMethod
  /** `true` only: never verified, or verified more than six months ago. Sending `false` is a 400. */
  stale?: true
  /** Staff only: draft, pending or published. Ignored for everyone else. */
  recordStatus?: RecordStatus
  /** true: facilities with at least one active relay group. */
  relay?: boolean
  /** One mail rule tag. */
  mailRule?: string
  /** ISO 639-1 code. */
  language?: string
}

export const getFacilities = (params?: FacilityListParams) =>
  getList<Prison>('/prison/prisons', params)

/** Every facility matching the filters (every page). */
export const getAllFacilities = (params?: Omit<FacilityListParams, 'page' | 'page_size'>) =>
  getAllPages<Prison>('/prison/prisons', params)

/** The countries and routing methods present, with counts, for the index's chips. */
export const getFacilityFilters = () => getOne<FilterValues<'country' | 'routing'>>('/prison/filters')

/** full=true adds prisoners and relay_groups. */
export const getFacility = (id: number, full = true) =>
  getOne<Prison>('/prison/prison', { id, full })

/**
 * The master list of mail rules. Fetch it; admins can add rules, so never compile it in.
 * `retired` (staff only) includes retired rules, flagged `retired: true`.
 */
export const getMailRules = (retired = false) => getOne<MailRuleList>('/prison/mail-rules', retired ? { retired: true } : undefined)

// Directory writes are superadmin-only (22 Sept); group admins propose edits
// through corrections.ts. Relay links are the exception: a group admin links
// and unlinks their own active group (below). Unlike a prisoner's, a facility's
// edits and relay links don't touch queued letters.

/** The fields PUT /prison/prison accepts (PRISON_FIELDS in the API). */
export type FacilityFields = Partial<
  Pick<
    Prison,
    | 'prisonName' | 'address' | 'country' | 'routing' | 'scanService' | 'mailRules' | 'pageLimit' | 'photoLimit'
    | 'mailLanguages' | 'notes' | 'verifiedBy' | 'verifiedAt' | 'verificationNotes' | 'recordStatus'
  >
>

/** Superadmin only. Send just the fields that changed: the audit log records what was sent. `address` replaces the whole object. */
export const updateFacility = (id: number, fields: FacilityFields) =>
  put<{ updatedRows: number }>('/prison/prison', { id, ...fields })

/** Superadmin only. Refused while prisoners are listed there (a 400, SequelizeForeignKeyConstraintError). */
export const deleteFacility = (id: number) => del<number>('/prison/prison', { id })

/**
 * Attach a group that prints and mails for this facility. Idempotent; takes
 * effect at once. Answers with the facility (full), relay groups included. A
 * superadmin links any group; a group admin only their own group, and only
 * while it is active (README "What each role can do"): another group's is a 403
 * ("own group only"), and a pending or suspended group's a 403 saying which.
 */
export const linkRelayGroup = (prison: number, chapter: number) =>
  put<{ updatedRows: Prison; chapter: number; prison: number }>('/prison/relay', { prison, chapter })

/** Detach a relay group: the same people as linking. A 404 if there was no link. */
export const unlinkRelayGroup = (prison: number, chapter: number) => del<number>('/prison/relay', { prison, chapter })

// --- The master mail-rule list (README "Changing the master list (admin)") ----

export interface MailRuleInput {
  /** lower_snake_case, 3 to 40 characters, unique. Never changes once created. */
  tag: string
  category: MailRuleCategory
  /** 3 to 80 characters. */
  label: string
  description?: string | null
}

/**
 * POST /prison/mail-rule (superadmin): a new rule on the master list. A 409
 * DuplicateRuleError when the list already says the same thing in other words
 * (the same words in another order, a singular for a plural).
 */
export const createMailRule = (rule: MailRuleInput) => post<MailRule>('/prison/mail-rule', rule)

/**
 * PUT /prison/mail-rule (superadmin): reword, recategorise, retire (`retired:
 * true`) or restore. Answers with `prisons`, how many facilities carry it. The
 * tag never changes (a 409 RuleTagError); a label another rule already has is a
 * 409 DuplicateRuleError.
 */
export const updateMailRule = (id: number, changes: Partial<Omit<MailRuleInput, 'tag'>> & { retired?: boolean }) =>
  put<MailRule & { prisons: number }>('/prison/mail-rule', { id, ...changes })

/** DELETE /prison/mail-rule (superadmin): only a rule no facility carries; otherwise a 409 RuleInUseError, and it should be retired. */
export const deleteMailRule = (id: number) => del<MailRule>('/prison/mail-rule', { id })

/** GET /prison/history?id=: what happened to the facility's record, newest first, paginated. Staff only. */
export const getFacilityHistory = (id: number, params?: Pick<ListParams, 'page' | 'page_size'>) =>
  getList<HistoryEntry>('/prison/history', { id, ...params })
