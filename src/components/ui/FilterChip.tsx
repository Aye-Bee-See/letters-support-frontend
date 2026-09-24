import { Link, type To } from 'react-router-dom'

// .filter-chip from style.css. A link, as in the prototype, so filters live in
// the URL (back button, reload and shared links keep them).
export default function FilterChip({ to, active, children }: { to: To; active: boolean; children: string }) {
  return (
    <Link to={to} className={active ? 'filter-chip active' : 'filter-chip'} aria-current={active ? 'true' : undefined}>
      {children}
    </Link>
  )
}
