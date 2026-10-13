import { useId, type ReactNode } from 'react'

// The public directory pages' search box and filter dropdowns (style.css,
// .directory-field), each with a label for screen readers only: the filter
// bar shows none. Their pager is components/ui/Pager with PUBLIC_PAGER.

/** The search box at the start of the filter bar. */
export function DirectorySearch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="directory-field directory-search"
        type="search"
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
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
  const id = useId()
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="directory-field" value={value} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{any}</option>
        {children}
      </select>
    </>
  )
}
