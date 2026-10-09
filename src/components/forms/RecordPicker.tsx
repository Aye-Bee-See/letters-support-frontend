import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { toApiError } from '../../api/client'
import type { ListResult } from '../../types'
import {
  matchLocal,
  moveActive,
  offered,
  pickerStatus,
  PICKER_DELAY_MS,
  type PickerAnswer,
  type PickerClasses,
} from './recordPickerState'

// One search-as-you-type picker for finding a record: an ARIA combobox with a
// listbox. Type to search, Down and Up to move through the matches, Enter to
// pick, Escape to close. With `fetch` it asks the API (the list endpoints' `q`)
// once typing pauses, for one page of matches, instead of loading a whole table
// to fill a dropdown; with `options` it filters a short list already in hand.
// Picking calls `onSelect` and empties the box: the page shows the choice.
//
// Styled by `classes` (the new-letter tiles pass pages/new-letter.css's), or
// inline otherwise, as neither admin.css nor org-settings.css has a dropdown.

type Source<T> =
  | {
      /** The first page of matches for a query: the caller asks for PICKER_PAGE_SIZE rows. */
      fetch: (q: string) => Promise<ListResult<T>>
      options?: never
      text?: never
      loading?: never
    }
  | {
      /** A short list in hand, filtered here. A blank query lists the first of them. */
      options: T[]
      /** The words a query is matched against. */
      text: (row: T) => string
      /** The options are still loading. */
      loading?: boolean
      fetch?: never
    }

type Props<T extends { id: number }> = Source<T> & {
  /** What is being searched for, for screen readers. Ignored when `id` ties the box to a visible <label>. */
  label: string
  /** The input's id, for a <label htmlFor>. */
  id?: string
  placeholder?: string
  /** One row's content in the list. */
  render: (row: T) => ReactNode
  /** Ids never offered: those already linked, the record itself. */
  exclude?: Iterable<number> | null
  onSelect: (row: T) => void
  disabled?: boolean
  classes?: PickerClasses
}

const DROPDOWN_STYLE: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: '100%',
  zIndex: 50,
  background: 'var(--white)',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  maxHeight: '18rem',
  overflowY: 'auto',
  textAlign: 'left',
}
const OPTION_STYLE: CSSProperties = {
  padding: '0.45rem 0.7rem',
  fontFamily: 'var(--sans)',
  fontSize: '0.85rem',
  lineHeight: 1.35,
  cursor: 'pointer',
  borderBottom: '1px solid var(--off-white)',
}
const STATUS_STYLE: CSSProperties = { ...OPTION_STYLE, cursor: 'default', color: 'var(--mid)' }

export default function RecordPicker<T extends { id: number }>(props: Props<T>) {
  const { label, id: inputId, placeholder, render, exclude, onSelect, disabled = false, classes } = props
  const local = props.options !== undefined
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  // The highlighted match, by index into `rows`; -1 for none.
  const [active, setActive] = useState(-1)
  const [answer, setAnswer] = useState<PickerAnswer<T> | null>(null)
  const [failed, setFailed] = useState<{ q: string; message: string } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()
  const listId = `${id}-list`
  const optionId = (index: number) => `${id}-option-${index}`

  // The latest fetch, so a caller's inline function doesn't restart the search on every render.
  const fetchRef = useRef(props.fetch)
  useEffect(() => {
    fetchRef.current = props.fetch
  })

  const q = query.trim()
  // Ask the API once typing pauses; each pause is one request, and an answer
  // that comes back after the query moved on is dropped.
  useEffect(() => {
    if (local || !q) return
    let current = true
    const timer = setTimeout(() => {
      fetchRef
        .current?.(q)
        .then((result) => {
          if (current) setAnswer({ q, items: result.items, total: result.total })
        })
        .catch((err: unknown) => {
          if (current) setFailed({ q, message: toApiError(err).message })
        })
    }, PICKER_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [local, q])

  const shownAnswer = local ? matchLocal(props.options ?? [], props.text ?? (() => ''), q) : answer
  const rows = shownAnswer && shownAnswer.q === q ? offered(shownAnswer.items, exclude) : []
  const status = pickerStatus({ query, answer: shownAnswer, failed, shown: rows.length, browse: local, loading: local && props.loading })
  const current = open && active >= 0 && active < rows.length ? active : -1

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keep the highlighted match in view as the arrows move through a long list.
  useEffect(() => {
    if (current >= 0) list.current?.children[current]?.scrollIntoView({ block: 'nearest' })
  }, [current])

  function pick(row: T) {
    onSelect(row)
    setQuery('')
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        setOpen(true)
        setActive(moveActive(current, e.key === 'ArrowDown' ? 1 : -1, rows.length))
        break
      case 'Enter': {
        // Never the enclosing form's submit: a search box in an edit form isn't its Save.
        e.preventDefault()
        const row = current >= 0 ? rows[current] : undefined
        if (row) pick(row)
        break
      }
      case 'Escape':
        if (open) {
          // Close the list; a second Escape is the search field's own (clear).
          e.preventDefault()
          setOpen(false)
          setActive(-1)
        }
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  const dropdownClass = classes?.dropdown ? (open ? (classes.dropdownOpen ?? classes.dropdown) : classes.dropdown) : undefined
  const dropdownStyle = classes?.dropdown ? undefined : { ...DROPDOWN_STYLE, display: open ? 'block' : 'none' }
  const optionStyle = classes?.option ? undefined : OPTION_STYLE

  return (
    <div ref={box} style={{ position: 'relative', flex: '1 1 14rem', minWidth: 0 }}>
      <input
        id={inputId}
        className={classes?.input}
        style={{ width: '100%' }}
        type="search"
        autoComplete="off"
        role="combobox"
        aria-label={inputId ? undefined : label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={current >= 0 ? optionId(current) : undefined}
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <div className={dropdownClass} style={dropdownStyle}>
        <div ref={list} role="listbox" id={listId} aria-label={label}>
          {rows.map((row, i) => (
            <div
              key={row.id}
              id={optionId(i)}
              className={classes?.option}
              role="option"
              aria-selected={i === current}
              // The highlight for the arrow keys and the pointer; inline, as no style sheet has one.
              style={i === current ? { ...optionStyle, background: 'var(--off-white)' } : optionStyle}
              // Keep focus in the input, so the list doesn't close before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(row)}
            >
              {render(row)}
            </div>
          ))}
        </div>
        {status && (
          <div className={classes?.option} style={classes?.option ? { color: 'var(--mid)', cursor: 'default' } : STATUS_STYLE} role="status">
            {status}
          </div>
        )}
      </div>
    </div>
  )
}
