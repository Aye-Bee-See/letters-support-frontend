import { useCallback, useEffect, useState } from 'react'
import { toApiError } from '../api/client'
import type { ApiError } from '../types'

export interface ApiState<T> {
  data: T | null
  error: ApiError | null
  /** Nothing to show yet: the first request, or one for new deps, is in flight. */
  loading: boolean
  /** With `keepPrevious`: the last answer stays on screen while `reload()` asks again. Otherwise always false. */
  reloading: boolean
  /** Run the request again (after an edit, or a retry button). */
  reload: () => void
}

export interface ApiOptions {
  /**
   * Keep the last answer on screen while `reload()` runs, so a page doesn't
   * blank and remount after every action. For the same deps only: a change of
   * deps still clears it.
   */
  keepPrevious?: boolean
}

type Primitive = string | number | boolean | null | undefined

/** A settled request: `key` is the deps plus the reload count, `depsKey` the deps alone. */
export interface Settled<T> {
  key: string
  depsKey: string
  data: T | null
  error: ApiError | null
}

/**
 * What the hook returns for the request now wanted (`key`, for `depsKey`),
 * given the last one that settled: that request's own answer once it is in;
 * with `keepPrevious`, the last data for the same deps while a reload runs;
 * otherwise nothing yet.
 */
export function apiView<T>(
  settled: Settled<T> | null,
  key: string,
  depsKey: string,
  keepPrevious: boolean,
): Pick<ApiState<T>, 'data' | 'error' | 'loading' | 'reloading'> {
  if (settled?.key === key) return { data: settled.data, error: settled.error, loading: false, reloading: false }
  if (keepPrevious && settled && settled.depsKey === depsKey && settled.data !== null)
    return { data: settled.data, error: null, loading: false, reloading: true }
  return { data: null, error: null, loading: true, reloading: false }
}

/**
 * Run an API function when the component mounts and whenever `deps` change.
 *
 *   const { data, error, loading } = useApi(() => getPrisoner(id), [id])
 *
 * `deps` are the values the request depends on (ids, filters), as primitives.
 * While a request for new deps is in flight, `data` is null rather than the
 * previous record, so a page never shows one prisoner's data under another's
 * URL. By default `reload()` clears it too. With `{ keepPrevious: true }` the
 * last answer stays while the same deps are asked again, `reloading` says so,
 * and whatever the reload brings (data or an error) then replaces it.
 */
export function useApi<T>(request: () => Promise<T>, deps: Primitive[], options: ApiOptions = {}): ApiState<T> {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const depsKey = JSON.stringify(deps)
  const key = JSON.stringify([...deps, attempt])

  useEffect(() => {
    let current = true
    request()
      .then((data) => {
        if (current) setSettled({ key, depsKey, data, error: null })
      })
      .catch((err: unknown) => {
        if (current) setSettled({ key, depsKey, data: null, error: toApiError(err) })
      })
    return () => {
      current = false
    }
    // `key` stands for `deps` (and so for `depsKey`); `request` is a new closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...apiView(settled, key, depsKey, options.keepPrevious ?? false), reload }
}
