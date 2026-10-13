import { useCallback } from 'react'
import { forgetWriters, getCachedWriters } from '../api/writers'
import type { ApiError, Writer } from '../types'
import { useApi } from './useApi'
import { useAuth } from './useAuth'

/**
 * One of the signed-in group's unclaimed writers, by id, from GET /auth/writers:
 * the call that carries `orgWrappedPrivateKey` and `claimToken` (GET /auth/user
 * strips key columns, so it can't find one writer instead). The list is kept
 * for a minute (getCachedWriters), so going from the inbox to a writer's edit
 * and hand-off pages asks once; `reload` asks again. `missing` when the group
 * has no such writer any more: claimed (the group loses it), deleted, or never
 * the group's.
 */
export function useManagedWriter(id: number | null): {
  writer: Writer | null
  missing: boolean
  loading: boolean
  error: ApiError | null
  reload: () => void
} {
  const account = useAuth().user?.id ?? null
  const list = useApi(
    () => (id === null || account === null ? Promise.resolve([] as Writer[]) : getCachedWriters(account)),
    [id, account],
  )
  const { reload: again } = list
  const reload = useCallback(() => {
    forgetWriters()
    again()
  }, [again])
  const writer = list.data?.find((w) => w.id === id) ?? null
  return { writer, missing: list.data !== null && !writer, loading: list.loading, error: list.error, reload }
}
