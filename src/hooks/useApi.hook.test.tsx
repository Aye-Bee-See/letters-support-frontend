import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useApi, type ApiOptions } from './useApi'

// useApi as a hook, with requests the test answers by hand (useApi.test.ts has
// its pure decision, apiView).

/** A request the test settles when it chooses, and how many times it was made. */
function requests<T>() {
  const pending: { deps: unknown[]; resolve: (value: T) => void; reject: (err: unknown) => void }[] = []
  const make = (...deps: unknown[]) =>
    new Promise<T>((resolve, reject) => {
      pending.push({ deps, resolve, reject })
    })
  return { make, pending }
}

function mount<T>(made: ReturnType<typeof requests<T>>, id: number, options?: ApiOptions) {
  return renderHook(({ id }: { id: number }) => useApi(() => made.make(id), [id], options), { initialProps: { id } })
}

const failure = { status: 500, name: null, condition: null, errors: [], message: 'Server error' }

describe('useApi', () => {
  it('loads on mount', async () => {
    const made = requests<{ id: number }>()
    const { result } = mount(made, 7)
    expect(result.current).toMatchObject({ data: null, error: null, loading: true, reloading: false })
    expect(made.pending).toHaveLength(1)
    await act(async () => made.pending[0].resolve({ id: 7 }))
    expect(result.current).toMatchObject({ data: { id: 7 }, error: null, loading: false, reloading: false })
  })

  it('normalises a failure into the client’s error shape', async () => {
    const made = requests<{ id: number }>()
    const { result } = mount(made, 7)
    await act(async () => made.pending[0].reject(new Error('boom')))
    expect(result.current).toMatchObject({ data: null, loading: false, error: { status: 0, message: 'boom' } })
  })

  it('a change of deps clears the data at once, even with keepPrevious', async () => {
    const made = requests<{ id: number }>()
    const { result, rerender } = mount(made, 7, { keepPrevious: true })
    await act(async () => made.pending[0].resolve({ id: 7 }))
    rerender({ id: 8 })
    // Prisoner 7's record never shows under prisoner 8's URL.
    expect(result.current).toMatchObject({ data: null, loading: true, reloading: false })
    await act(async () => made.pending[1].resolve({ id: 8 }))
    expect(result.current.data).toEqual({ id: 8 })
  })

  it('by default, reload clears the data while it runs', async () => {
    const made = requests<{ v: number }>()
    const { result } = mount(made, 7)
    await act(async () => made.pending[0].resolve({ v: 1 }))
    act(() => result.current.reload())
    expect(result.current).toMatchObject({ data: null, loading: true, reloading: false })
    await act(async () => made.pending[1].resolve({ v: 2 }))
    expect(result.current.data).toEqual({ v: 2 })
  })

  it('with keepPrevious, reload keeps the data and says it is reloading, then shows the new answer', async () => {
    const made = requests<{ v: number }>()
    const { result } = mount(made, 7, { keepPrevious: true })
    await act(async () => made.pending[0].resolve({ v: 1 }))
    act(() => result.current.reload())
    expect(made.pending).toHaveLength(2)
    expect(result.current).toMatchObject({ data: { v: 1 }, loading: false, reloading: true, error: null })
    await act(async () => made.pending[1].resolve({ v: 2 }))
    expect(result.current).toMatchObject({ data: { v: 2 }, loading: false, reloading: false })
  })

  it('with keepPrevious, a failed reload keeps the data and reports the error beside it (#44)', async () => {
    const made = requests<{ v: number }>()
    const { result } = mount(made, 7, { keepPrevious: true })
    await act(async () => made.pending[0].resolve({ v: 1 }))
    act(() => result.current.reload())
    await act(async () => made.pending[1].reject(failure))
    expect(result.current).toMatchObject({ data: { v: 1 }, error: failure, loading: false, reloading: false })
    // And the next reload that works clears the error.
    act(() => result.current.reload())
    await act(async () => made.pending[2].resolve({ v: 3 }))
    expect(result.current).toMatchObject({ data: { v: 3 }, error: null })
  })

  it('without keepPrevious, a failed reload leaves the error alone', async () => {
    const made = requests<{ v: number }>()
    const { result } = mount(made, 7)
    await act(async () => made.pending[0].resolve({ v: 1 }))
    act(() => result.current.reload())
    await act(async () => made.pending[1].reject(failure))
    expect(result.current).toMatchObject({ data: null, error: failure })
  })

  it('ignores an answer that arrives after a newer request (deps changed)', async () => {
    const made = requests<{ id: number }>()
    const { result, rerender } = mount(made, 7)
    rerender({ id: 8 })
    // The second answers first, then the first, late.
    await act(async () => made.pending[1].resolve({ id: 8 }))
    await act(async () => made.pending[0].resolve({ id: 7 }))
    expect(result.current.data).toEqual({ id: 8 })
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('ignores a late answer from before a reload, and a late failure too', async () => {
    const made = requests<{ v: number }>()
    const { result } = mount(made, 7, { keepPrevious: true })
    act(() => result.current.reload())
    await act(async () => made.pending[1].resolve({ v: 2 }))
    await act(async () => made.pending[0].reject(failure))
    expect(result.current).toMatchObject({ data: { v: 2 }, error: null, loading: false })
  })

  it('stops listening once unmounted', async () => {
    const made = requests<{ v: number }>()
    const { result, unmount } = mount(made, 7)
    unmount()
    await act(async () => made.pending[0].resolve({ v: 1 }))
    expect(result.current.data).toBeNull()
  })
})
