// The UI says "facility"; the API says "prison" (/prison).
import { getAllPages, getList, getOne } from './client'
import type { FilterValues, ListParams, MailRuleList, Prison, RecordStatus, RoutingMethod } from '../types'

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

/** The master list of mail rules. Fetch it; admins can add rules, so never compile it in. */
export const getMailRules = () => getOne<MailRuleList>('/prison/mail-rules')
