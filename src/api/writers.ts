// Managed writers: accounts a group holds for people who write through it.
import { getList } from './client'
import type { ListParams, Writer } from '../types'

/** A group gets its own unclaimed writers; an admin can pass { chapter: id }. */
export const getWriters = (params?: ListParams & { chapter?: number }) =>
  getList<Writer>('/auth/writers', params)

// Creating a writer and issuing claim tokens need keys made in the browser
// (POST /auth/writer, POST /auth/writer/token). Built in Step 6.
