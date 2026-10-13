import type { CSSProperties, ReactNode } from 'react'

// The public directory pages' search box, filter dropdowns and pager. They
// borrow .filter-chip and .results-count and are otherwise styled inline here,
// in one place.

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

/**
 * Previous and next under a directory list. Nothing when everything fits on
 * one page, unless the URL asks for a page past the end (an old link), which
 * would otherwise leave an empty page and no way back.
 */
export function DirectoryPager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const button = (to: number, text: string, disabled = false) => (
    <button type="button" className="filter-chip" disabled={disabled} onClick={() => onPage(to)} style={disabled ? { opacity: 0.4, cursor: 'default' } : undefined}>
      {text}
    </button>
  )
  if (pages <= 1 && page <= pages) return null
  return (
    <nav aria-label="Pages" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 0 0' }}>
      {page > pages ? (
        <>
          <span className="results-count" style={{ marginLeft: 0 }}>
            There {pages === 1 ? 'is only 1 page' : `are only ${pages} pages`}.
          </span>
          {button(pages, `Go to page ${pages}`)}
        </>
      ) : (
        <>
          {button(page - 1, '← Previous', page <= 1)}
          <span className="results-count" style={{ marginLeft: 0 }}>
            Page {page} of {pages}
          </span>
          {button(page + 1, 'Next →', page >= pages)}
        </>
      )}
    </nav>
  )
}
