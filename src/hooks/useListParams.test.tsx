import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useListParams, usePageClamp, useSearchBox } from './useListParams'

// The admin lists' URL-held filters, their search box, and the page clamp, in a
// router: the URL is the state, and how each change reached history matters.

function routerAt(url: string) {
  return ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
}

/** The hooks under test, plus where the router is and how it got there. */
function useWhere() {
  const location = useLocation()
  return { search: location.search, how: useNavigationType(), navigate: useNavigate() }
}

describe('useListParams', () => {
  const mount = (url = '/admin/prisoners') =>
    renderHook(() => ({ list: useListParams(), where: useWhere() }), { wrapper: routerAt(url) })

  it('reads the page, 1 for anything that isn’t a page', () => {
    expect(mount('/x?page=3').result.current.list.page).toBe(3)
    for (const page of ['abc', '-2', '0', '']) expect(mount(`/x?page=${page}`).result.current.list.page).toBe(1)
  })

  it('a filter change goes back to page 1, as a new history entry', () => {
    const { result } = mount('/x?status=active&page=4')
    act(() => result.current.list.update({ status: 'pending' }))
    expect(result.current.where.search).toBe('?status=pending')
    expect(result.current.where.how).toBe('PUSH')
  })

  it('paging keeps the filters', () => {
    const { result } = mount('/x?status=active')
    act(() => result.current.list.update({ page: '2' }))
    expect(result.current.where.search).toBe('?status=active&page=2')
    expect(result.current.where.how).toBe('PUSH')
  })

  it('the search alone replaces the history entry; with another filter it adds one', () => {
    const { result } = mount('/x?page=3')
    act(() => result.current.list.update({ q: 'smith' }))
    expect(result.current.where.search).toBe('?q=smith')
    expect(result.current.where.how).toBe('REPLACE')
    act(() => result.current.list.update({ q: 'jones', status: 'active' }))
    expect(result.current.where.how).toBe('PUSH')
  })

  it('an empty value clears its parameter', () => {
    const { result } = mount('/x?q=smith&status=active')
    act(() => result.current.list.update({ q: undefined, status: '' }))
    expect(result.current.where.search).toBe('')
  })

  it('clear keeps only the parameters named', () => {
    const { result } = mount('/x?q=smith&status=active&page=2&sort=name')
    act(() => result.current.list.clear(['sort', 'missing']))
    expect(result.current.where.search).toBe('?sort=name')
  })
})

/** Let `ms` of fake time pass. */
const pass = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

describe('useSearchBox', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** The box wired as GroupsList wires it: typing writes `q` through useListParams. */
  const mount = (url = '/admin/groups') =>
    renderHook(
      () => {
        const list = useListParams()
        const q = list.params.get('q') ?? ''
        const [search, setSearch] = useSearchBox(q, (value) => list.update({ q: value }))
        return { list, search, setSearch, where: useWhere() }
      },
      { wrapper: routerAt(url) },
    )

  it('writes `q` 300 ms after typing pauses, trimmed, not before', () => {
    const { result } = mount()
    act(() => result.current.setSearch('  smith '))
    expect(result.current.search).toBe('  smith ')
    pass(299)
    expect(result.current.where.search).toBe('')
    pass(1)
    expect(result.current.where.search).toBe('?q=smith')
    expect(result.current.where.how).toBe('REPLACE')
  })

  it('each keystroke starts the wait again', () => {
    const { result } = mount()
    act(() => result.current.setSearch('s'))
    pass(200)
    act(() => result.current.setSearch('sm'))
    pass(200)
    expect(result.current.where.search).toBe('')
    pass(100)
    expect(result.current.where.search).toBe('?q=sm')
  })

  it('a search goes back to page 1', () => {
    const { result } = mount('/admin/groups?status=active&page=5')
    act(() => result.current.setSearch('smith'))
    pass(300)
    expect(result.current.where.search).toBe('?status=active&q=smith')
  })

  it('emptying the box clears `q`', () => {
    const { result } = mount('/admin/groups?q=smith')
    expect(result.current.search).toBe('smith')
    act(() => result.current.setSearch('   '))
    pass(300)
    expect(result.current.where.search).toBe('')
  })

  it('a filter chosen while typing survives the search that follows', () => {
    const { result } = mount()
    act(() => result.current.setSearch('smith'))
    pass(100)
    act(() => result.current.list.update({ status: 'pending' }))
    pass(300)
    expect(new URLSearchParams(result.current.where.search).get('status')).toBe('pending')
    expect(new URLSearchParams(result.current.where.search).get('q')).toBe('smith')
  })

  it('follows the URL when it changes some other way, and writes nothing back', () => {
    const { result } = mount('/admin/groups?q=smith')
    act(() => {
      void result.current.where.navigate('/admin/groups?q=jones')
    })
    expect(result.current.search).toBe('jones')
    act(() => {
      void result.current.where.navigate(-1)
    })
    expect(result.current.search).toBe('smith')
    pass(1000)
    expect(result.current.where.search).toBe('?q=smith')
    expect(result.current.where.how).toBe('POP')
  })

  it('a box that already says what the URL says starts no search', () => {
    const onSearch = vi.fn()
    const { result } = renderHook(() => useSearchBox('smith', onSearch), { wrapper: routerAt('/x') })
    act(() => result.current[1]('smith  '))
    pass(1000)
    expect(onSearch).not.toHaveBeenCalled()
  })
})

describe('usePageClamp', () => {
  it('leaves a page still loading alone, and a page within the list', () => {
    const toPage = vi.fn()
    const { rerender } = renderHook(({ page, pages }: { page: number; pages: number | null }) => usePageClamp(page, pages, toPage), {
      initialProps: { page: 5, pages: null as number | null },
    })
    rerender({ page: 3, pages: 3 })
    rerender({ page: 1, pages: 3 })
    expect(toPage).not.toHaveBeenCalled()
  })

  it('sends a page past the end to the last page, replacing the history entry', () => {
    // As Queue.tsx calls it: the clamp's page change replaces, so Back skips the empty page.
    const { result } = renderHook(
      () => {
        const [params, setParams] = useSearchParams()
        const page = Number(params.get('page')) || 1
        usePageClamp(page, 3, (n) => setParams({ page: String(n) }, { replace: true }))
        return useWhere()
      },
      { wrapper: routerAt('/admin/queue?page=7') },
    )
    expect(result.current.search).toBe('?page=3')
    expect(result.current.how).toBe('REPLACE')
  })

  it('calls the latest toPage, not the first render’s', () => {
    const first = vi.fn()
    const latest = vi.fn()
    const { rerender } = renderHook(({ pages, toPage }: { pages: number | null; toPage: (n: number) => void }) => usePageClamp(4, pages, toPage), {
      initialProps: { pages: null as number | null, toPage: first },
    })
    rerender({ pages: 2, toPage: latest })
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledExactlyOnceWith(2)
  })
})
