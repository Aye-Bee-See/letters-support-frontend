// Directory edit proposals (/moderation). Group admins and superadmins only:
// writers cannot propose (22 Sept), so hide the entry point from them.
import { getList, getOne, post } from './client'
import type { ListParams, Submission, SubmissionResource, SubmissionStatus } from '../types'

export interface CorrectionInput {
  resource: SubmissionResource
  /** Omit to propose a new record. */
  target?: number
  fields: Record<string, unknown>
  /** Optional, encouraged. */
  evidence?: string
  note?: string
}

export const submitCorrection = (input: CorrectionInput) =>
  post<Submission>('/moderation/submission', input)

export const getSubmissions = (
  params?: ListParams & { status?: SubmissionStatus | 'all'; resource?: SubmissionResource },
) => getList<Submission>('/moderation/submissions', params)

export const getSubmission = (id: number) => getOne<Submission>('/moderation/submission', { id })
