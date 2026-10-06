import { useEffect } from 'react'
import { runHousekeeping } from '../groups/housekeeping'
import { useAuth } from './useAuth'
import type { GroupState } from './useGroup'

/** The session (its token) housekeeping last ran for: once per sign-in, whichever page mounts it first. */
let ranFor: string | null = null

/**
 * Run the group's quiet housekeeping (src/groups/housekeeping.ts) once per
 * session, as soon as the group is active and its key is open here. Pass the
 * page's useGroup() state. Never blocks rendering and never reports anything:
 * failures are retried next session. Mounted by GroupGate, so every group page
 * runs it; calling it again elsewhere does nothing more.
 */
export function useGroupHousekeeping(group: Pick<GroupState, 'chapterId' | 'keyState' | 'isActive' | 'keyVersion'>) {
  const { token, groupKeypair } = useAuth()
  const { chapterId, keyState, isActive, keyVersion } = group
  const ready = Boolean(token && groupKeypair && chapterId !== null && keyState === 'ready' && isActive)

  useEffect(() => {
    if (!ready || !token || !groupKeypair || chapterId === null || ranFor === token) return
    ranFor = token
    void runHousekeeping({ groupId: chapterId, groupKeypair, keyVersion }).catch(() => undefined)
  }, [ready, token, groupKeypair, chapterId, keyVersion])
}
