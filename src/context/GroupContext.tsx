import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toApiError } from '../api/client'
import { getGroup } from '../api/groups'
import { useAuth } from '../hooks/useAuth'
import type { ApiError, Chapter } from '../types'
import { GroupContext, type GroupRecordState } from './group-context'

/** An answer, and whose it is: the account and group it was asked for. */
interface Settled {
  who: string
  group: Chapter | null
  error: ApiError | null
}

/**
 * The signed-in group admin's group record (GET /chapter/chapter?full=true),
 * fetched once and shared by GroupGate, every group page and the notices in
 * them (useGroup), so a save on one page is seen on all of them and moving
 * between pages asks nothing again. Mounted once in App.tsx, inside
 * AuthProvider.
 *
 * Fetches only for a group admin in a group. Asks again when the account or
 * its group changes (starting from nothing), when the session's group key
 * changes (AuthContext's groupKeySet: set up, handed, taken back, rotated, which
 * can make this admin the group-owner admin), and on `reload()`; those two keep
 * the record on screen until the new one is in.
 */
export function GroupProvider({ children }: { children: ReactNode }) {
  const { user, keys } = useAuth()
  const chapterId = user?.role === 'chapter' ? user.chapterId : null
  const who = chapterId === null ? '' : `${user?.id}:${chapterId}`
  const orgKey = keys?.orgKey ?? null
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    if (chapterId === null) return
    let live = true
    getGroup(chapterId, true)
      .then((group) => {
        if (live) setSettled({ who, group, error: null })
      })
      .catch((err: unknown) => {
        if (!live) return
        const error = toApiError(err)
        // A failed reload keeps the record beside its error, unless the group is
        // gone from view (a 404: no longer active), which GroupGate then says.
        setSettled((prev) => ({ who, group: prev?.who === who && error.status !== 404 ? prev.group : null, error }))
      })
    return () => {
      live = false
    }
    // `orgKey` and `attempt` aren't read here: a change to either asks again.
  }, [who, chapterId, orgKey, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const value = useMemo<GroupRecordState>(() => {
    const mine = settled?.who === who ? settled : null
    return {
      chapterId,
      group: chapterId === null ? null : (mine?.group ?? null),
      loading: chapterId !== null && mine === null,
      error: chapterId === null ? null : (mine?.error ?? null),
      reload,
    }
  }, [chapterId, who, settled, reload])

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
}
