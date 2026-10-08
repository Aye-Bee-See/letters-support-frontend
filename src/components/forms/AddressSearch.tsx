import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

// The search box and dropdown from new-letter.html's address tiles
// (`addr-search`, `addr-dropdown`, `addr-option`; pages/new-letter.css), as an
// ARIA combobox with a listbox: type to filter, Down and Up to move through the
// matches, Enter to pick, Escape to close.

export interface AddressOption {
  id: number
  label: string
  sub?: string
}

export default function AddressSearch({
  options,
  onSelect,
  placeholder,
  label,
  loading = false,
}: {
  options: AddressOption[]
  onSelect: (id: number) => void
  placeholder: string
  /** What is being searched, for screen readers (the tile's heading isn't a label). */
  label: string
  /** The options are still loading: "Searching…" rather than "No matches". */
  loading?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  // The highlighted match, by index into `matches`; -1 for none.
  const [active, setActive] = useState(-1)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()
  const listId = `${id}-list`
  const optionId = (index: number) => `${id}-option-${index}`

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const found = q ? options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(q)) : options
    return found.slice(0, 20)
  }, [options, query])
  const current = open && active >= 0 && active < matches.length ? active : -1

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

  function pick(option: AddressOption) {
    onSelect(option.id)
    setQuery('')
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setOpen(true)
        setActive(Math.min(current + 1, matches.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setOpen(true)
        setActive(Math.max(current - 1, 0))
        break
      case 'Enter': {
        const option = current >= 0 ? matches[current] : undefined
        if (option) {
          e.preventDefault()
          pick(option)
        }
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

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <input
        className="addr-search"
        type="search"
        autoComplete="off"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={current >= 0 ? optionId(current) : undefined}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <div className={open ? 'addr-dropdown is-open' : 'addr-dropdown'}>
        <div ref={list} role="listbox" id={listId} aria-label={label}>
          {matches.map((o, i) => (
            <div
              key={o.id}
              id={optionId(i)}
              className="addr-option"
              role="option"
              aria-selected={i === current}
              // The highlight for the arrow keys; inline, as new-letter.css only styles :hover.
              style={i === current ? { background: 'var(--off-white)' } : undefined}
              // Keep focus in the input, so the list doesn't close before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              {o.label}
              {o.sub && <div className="addr-option-sub">{o.sub}</div>}
            </div>
          ))}
        </div>
        {matches.length === 0 && <div className="addr-option">{loading ? 'Searching…' : 'No matches'}</div>}
      </div>
    </div>
  )
}
