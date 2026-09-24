// The UI says "facility"; the API says "prison" (/prison).
import { getAllPages, getList, getOne } from './client'
import type { ListParams, MailRuleList, Prison, RoutingMethod } from '../types'

export interface FacilityListParams extends ListParams {
  country?: string
  routing?: RoutingMethod
  stale?: boolean
  /** true: facilities with at least one active relay group. */
  relay?: boolean
  /** One mail rule tag. */
  mailRule?: string
  /** ISO 639-1 code. */
  language?: string
}

export const getFacilities = (params?: FacilityListParams) =>
  getList<Prison>('/prison/prisons', params)

/** Every facility (every page), for the index to filter in the browser. */
export const getAllFacilities = (params?: Omit<FacilityListParams, 'page' | 'page_size'>) =>
  getAllPages<Prison>('/prison/prisons', params)

/** full=true adds prisoners and relay_groups. */
export const getFacility = (id: number, full = true) =>
  getOne<Prison>('/prison/prison', { id, full })

/** The master list of mail rules. Fetch it; admins can add rules, so never compile it in. */
export const getMailRules = () => getOne<MailRuleList>('/prison/mail-rules')
