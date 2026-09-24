import { useCallback, useEffect, useState } from 'react'
import { toApiError } from '../api/client'
import type { ApiError } from '../types'

export interface ApiState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  /** Run the request again (after an edit, or a retry button). */
  reload: () => void
}

type Primitive = string | number | boolean | null | undefined

interface Settled<T> {
  key: string
  data: T | null
  error: ApiError | null
}

/**
 * Run an API function when the component mounts and whenever `deps` change.
 *
 *   const { data, error, loading } = useApi(() => getPrisoner(id), [id])
 *
 * `deps` are the values the request depends on (ids, filters), as primitives.
 * While a new request is in flight, `data` is null rather than the previous
 * record, so a page never shows one prisoner's data under another's URL.
 */
export function useApi<T>(request: () => Promise<T>, deps: Primitive[]): ApiState<T> {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const key = JSON.stringify([...deps, attempt])

  useEffect(() => {
    let current = true
    request()
      .then((data) => {
        if (current) setSettled({ key, data, error: null })
      })
      .catch((err: unknown) => {
        if (current) setSettled({ key, data: null, error: toApiError(err) })
      })
    return () => {
      current = false
    }
    // `key` stands for `deps`; `request` is a new closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const fresh = settled?.key === key ? settled : null
  return { data: fresh?.data ?? null, error: fresh?.error ?? null, loading: fresh === null, reload }
}
