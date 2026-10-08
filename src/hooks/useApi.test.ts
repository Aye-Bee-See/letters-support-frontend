import { describe, expect, it } from 'vitest'
import type { ApiError } from '../types'
import { apiView, type Settled } from './useApi'

// The hook's decision, as useApi makes it: `key` is the deps plus the reload
// count, `depsKey` the deps alone (both JSON, as the hook builds them).
const keyOf = (deps: unknown[], attempt: number) => JSON.stringify([...deps, attempt])
const settledFor = <T>(deps: unknown[], attempt: number, data: T | null, error: ApiError | null = null): Settled<T> => ({
  key: keyOf(deps, attempt),
  depsKey: JSON.stringify(deps),
  data,
  error,
})
const view = <T>(settled: Settled<T> | null, deps: unknown[], attempt: number, keepPrevious: boolean) =>
  apiView(settled, keyOf(deps, attempt), JSON.stringify(deps), keepPrevious)

const failure: ApiError = { status: 500, name: null, condition: null, errors: [], message: 'Server error' }

describe('apiView', () => {
  it('is loading until the first answer, with or without keepPrevious', () => {
    for (const keep of [false, true]) {
      expect(view(null, [7], 0, keep)).toEqual({ data: null, error: null, loading: true, reloading: false })
    }
  })

  it('gives the answer once the request it asked for has settled', () => {
    const settled = settledFor([7], 0, { id: 7 })
    expect(view(settled, [7], 0, false)).toEqual({ data: { id: 7 }, error: null, loading: false, reloading: false })
    expect(view(settled, [7], 0, true)).toEqual({ data: { id: 7 }, error: null, loading: false, reloading: false })
  })

  it('by default clears the data while a reload runs', () => {
    expect(view(settledFor([7], 0, { id: 7 }), [7], 1, false)).toEqual({ data: null, error: null, loading: true, reloading: false })
  })

  it('with keepPrevious keeps the data, and says it is reloading, while a reload for the same deps runs', () => {
    expect(view(settledFor([7], 0, { id: 7 }), [7], 1, true)).toEqual({ data: { id: 7 }, error: null, loading: false, reloading: true })
  })

  it('with keepPrevious still clears the data when the deps change', () => {
    // Prisoner 7's record must never show under prisoner 8's URL, even after reloads.
    expect(view(settledFor([7], 2, { id: 7 }), [8], 2, true)).toEqual({ data: null, error: null, loading: true, reloading: false })
    expect(view(settledFor([7, 'a'], 0, { id: 7 }), [7, 'b'], 0, true).data).toBeNull()
  })

  it('with keepPrevious shows nothing kept after an error: retrying is loading', () => {
    expect(view(settledFor([7], 0, null, failure), [7], 1, true)).toEqual({ data: null, error: null, loading: true, reloading: false })
  })

  it('lets the reload’s own answer replace the kept one, an error included', () => {
    expect(view(settledFor([7], 1, { id: 7, v: 2 }), [7], 1, true)).toEqual({ data: { id: 7, v: 2 }, error: null, loading: false, reloading: false })
    expect(view(settledFor([7], 1, null, failure), [7], 1, true)).toEqual({ data: null, error: failure, loading: false, reloading: false })
  })
})
