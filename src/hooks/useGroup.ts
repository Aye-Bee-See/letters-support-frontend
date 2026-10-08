import { useContext } from 'react'
import { GroupContext } from '../context/group-context'
import type { ApiError, Chapter } from '../types'
import { useAuth } from './useAuth'

/**
 * Where the signed-in group admin stands with the group key (README "Group keys"):
 * - `no-key`: the group has no key yet; its first admin sets one up.
 * - `not-held`: the group has a key and this admin hasn't been handed it (or the
 *   copy they were handed didn't open), so they can't read or write its letters.
 * - `ready`: the group key is open in this session.
 */
export type GroupKeyState = 'no-key' | 'not-held' | 'ready'

export interface GroupState {
  /** The signed-in group admin's group id; null for an account in no group, and for anyone who isn't a group admin. */
  chapterId: number | null
  /** The group's record, full (relay facilities and supported prisoners). Null while it first loads, with no group, or when it couldn't be read. */
  group: Chapter | null
  loading: boolean
  /**
   * Loading the record failed. A 404 means the group isn't visible to its own
   * admins: the API shows the admins of a group that isn't active only what the
   * public sees, and a group that joined by invitation is unpublished until a
   * site admin approves it.
   */
  error: ApiError | null
  keyState: GroupKeyState
  /** This admin is the group-owner admin: hands the key out, takes it back, rotates it. */
  isOwner: boolean
  /** The group is an active member of the network. Pending and suspended groups read what the public reads and write nothing. */
  isActive: boolean
  /** The version of the group key this session holds (0 when the group has none): what anything sealed to the group names. */
  keyVersion: number
  /** Load the group's record again (after an edit), for every page at once. The key state comes from sign-in. */
  reload: () => void
}

/**
 * The signed-in group admin's group: one place every group page reads it from.
 * The record is GroupProvider's (context/GroupContext.tsx), fetched once from
 * GET /chapter/chapter?full=true and shared, so one `reload()` refreshes every
 * page; the key state comes from the key bundle that sign-in fetched
 * (`keys.orgKey`) and the group keypair it opened.
 */
export function useGroup(): GroupState {
  const record = useContext(GroupContext)
  if (!record) throw new Error('useGroup must be used inside <GroupProvider>')
  const { user, keys, groupKeypair } = useAuth()

  const orgKey = keys?.orgKey ?? null
  const keyState: GroupKeyState = !orgKey?.chapterPublicKey
    ? 'no-key'
    : orgKey.wrappedOrgPrivateKey && groupKeypair
      ? 'ready'
      : 'not-held'

  const group = record.group
  return {
    chapterId: record.chapterId,
    group,
    loading: record.loading,
    error: record.error,
    keyState,
    // The record is newer than the sign-in bundle when both are there.
    isOwner: group ? group.ownerId !== null && group.ownerId === user?.id : (orgKey?.isOwner ?? false),
    isActive: group?.accountStatus === 'active',
    keyVersion: orgKey?.chapterPublicKey ? orgKey.keyVersion : 0,
    reload: record.reload,
  }
}

/**
 * useGroup() on a page that only group admins reach, inside GroupGate: the gate
 * renders such a page only once the group's record is in and the group is
 * active, so `group` is always there. Elsewhere, use useGroup().
 */
export function useGatedGroup(): GroupState & { group: Chapter } {
  const state = useGroup()
  const { group } = state
  if (!group) throw new Error('useGatedGroup is for pages inside GroupGate, which waits for the group record')
  return { ...state, group }
}
