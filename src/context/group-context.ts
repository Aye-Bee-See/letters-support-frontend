import { createContext } from 'react'
import type { ApiError, Chapter } from '../types'

// Kept apart from GroupContext.tsx so that file exports only a component
// (React Fast Refresh requirement).

/** The signed-in group admin's group record, fetched once for the whole app (GroupProvider). */
export interface GroupRecordState {
  /** The signed-in group admin's group id; null for an account in no group, and for anyone who isn't a group admin. */
  chapterId: number | null
  /** The group's record, full. Null while it first loads, with no group, or when it couldn't be read. */
  group: Chapter | null
  /** Nothing to show yet: the first request for this account and group is in flight. A reload keeps the record on screen. */
  loading: boolean
  /** The last request failed. Beside a record, a reload failed and the record shown is the one before it. */
  error: ApiError | null
  /** Read the record again, for every page at once (after an edit). */
  reload: () => void
}

export const GroupContext = createContext<GroupRecordState | null>(null)
