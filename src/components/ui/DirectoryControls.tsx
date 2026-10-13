import type { CSSProperties, ReactNode } from 'react'

// The public directory pages' search box and filter dropdowns, styled inline
// here, in one place. Their pager is components/ui/Pager with PUBLIC_PAGER.

const FIELD_STYLE: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: '0.78rem',
  padding: '0.3rem 0.6rem',
  border: '1px solid var(--border)',
  background: 'var(--white)',
  color: 'var(--text)',
}

/** The search box at the start of the filter bar. */
export function DirectorySearch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="search"
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...FIELD_STYLE, minWidth: '13rem' }}
    />
  )
}

/** A filter with too many values for chips: a dropdown whose first option is "any". */
export function FilterSelect({
  label,
  value,
  any,
  onChange,
  children,
}: {
  label: string
  value: string
  /** The first option's words, for no filter. */
  any: string
  onChange: (value: string | undefined) => void
  children: ReactNode
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value || undefined)} style={FIELD_STYLE}>
      <option value="">{any}</option>
      {children}
    </select>
  )
}
