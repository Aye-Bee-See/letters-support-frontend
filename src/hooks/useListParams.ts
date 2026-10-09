import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

// URL-held filters for the admin directory lists (prisoners, facilities, groups).
// Parameters use the API's own names, so a link reads the same as the request it makes.

/** Wait this long after typing before searching. */
const SEARCH_DELAY_MS = 300

export function useListParams() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)

  /**
   * Set or clear (undefined) some parameters. Any change but paging goes back to
   * page 1. Typing in the search box replaces the history entry rather than
   * adding one per pause.
   */
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: Object.keys(changes).every((key) => key === 'q') })
  }

  /** Drop every parameter except those named. */
  const clear = (keep: string[] = []) => {
    const next = new URLSearchParams()
    for (const key of keep) {
      const value = params.get(key)
      if (value) next.set(key, value)
    }
    setParams(next)
  }

  return { params, page, update, clear }
}

/**
 * The search string for a link that changes some list parameters and keeps
 * the rest: a filter chip that sets or clears its own filter and leaves the
 * others, so filters combine. An empty or undefined value clears; any change
 * but paging goes back to page 1, as `update` does.
 */
export function listSearch(params: URLSearchParams, changes: Record<string, string | undefined>): string {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value)
    else next.delete(key)
  }
  if (!('page' in changes)) next.delete('page')
  const search = next.toString()
  return search ? `?${search}` : ''
}

/**
 * A reload that leaves the page past the end (its last items decided, moved or
 * deleted meanwhile) goes to the last page instead of showing an empty one with
 * no pager. `pages` is null until the list has loaded, so a page still loading
 * is left alone; `toPage` should replace the history entry.
 */
export function usePageClamp(page: number, pages: number | null, toPage: (page: number) => void) {
  const toPageRef = useRef(toPage)
  useEffect(() => {
    toPageRef.current = toPage
  })
  useEffect(() => {
    if (pages !== null && page > pages) toPageRef.current(pages)
  }, [page, pages])
}

/**
 * The search box's text. It writes `q` to the URL once typing pauses, and
 * follows `q` when the URL changes some other way (back, forward, a link), so a
 * stale box can't write an old query back.
 */
export function useSearchBox(q: string, onSearch: (q: string | undefined) => void) {
  const [search, setSearch] = useState(q)
  // The timer calls the latest onSearch, not the one from the render that started
  // it: that one closes over the URL as it was, and would drop a filter chosen
  // while typing. (setSearchParams' own updater form passes that same old URL.)
  const onSearchRef = useRef(onSearch)
  useEffect(() => {
    onSearchRef.current = onSearch
  })
  // Adjusted during render, as React recommends for state derived from a changing prop.
  const [syncedQ, setSyncedQ] = useState(q)
  if (q !== syncedQ) {
    setSyncedQ(q)
    if (search.trim() !== q) setSearch(q)
  }
  useEffect(() => {
    if (search.trim() === q) return
    const timer = setTimeout(() => onSearchRef.current(search.trim() || undefined), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
    // Only typing starts a search; `q` changes with every URL update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  return [search, setSearch] as const
}
