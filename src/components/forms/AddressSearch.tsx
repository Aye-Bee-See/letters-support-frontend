import { useMemo, useRef, useState, useEffect } from 'react'

// The search box and dropdown from new-letter.html's address tiles
// (`addr-search`, `addr-dropdown`, `addr-option`; pages/new-letter.css).

export interface AddressOption {
  id: number
  label: string
  sub?: string
}

export default function AddressSearch({
  options,
  onSelect,
  placeholder,
}: {
  options: AddressOption[]
  onSelect: (id: number) => void
  placeholder: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const found = q ? options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(q)) : options
    return found.slice(0, 20)
  }, [options, query])

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <input
        className="addr-search"
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      <div className={open ? 'addr-dropdown is-open' : 'addr-dropdown'}>
        {matches.length === 0 && <div className="addr-option">No matches</div>}
        {matches.map((o) => (
          <div
            key={o.id}
            className="addr-option"
            role="option"
            aria-selected={false}
            onClick={() => {
              onSelect(o.id)
              setQuery('')
              setOpen(false)
            }}
          >
            {o.label}
            {o.sub && <div className="addr-option-sub">{o.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
