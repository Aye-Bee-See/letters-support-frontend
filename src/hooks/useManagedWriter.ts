import { getAllWriters } from '../api/writers'
import type { ApiError, Writer } from '../types'
import { useApi } from './useApi'

/**
 * One of the signed-in group's unclaimed writers, by id, from GET /auth/writers:
 * the call that carries `orgWrappedPrivateKey` and `claimToken` (GET /auth/user
 * carries neither). `missing` when the group has no such writer any more:
 * claimed (the group loses it), deleted, or never the group's.
 */
export function useManagedWriter(id: number | null): {
  writer: Writer | null
  missing: boolean
  loading: boolean
  error: ApiError | null
  reload: () => void
} {
  const list = useApi(() => (id === null ? Promise.resolve([] as Writer[]) : getAllWriters()), [id])
  const writer = list.data?.find((w) => w.id === id) ?? null
  return { writer, missing: list.data !== null && !writer, loading: list.loading, error: list.error, reload: list.reload }
}
