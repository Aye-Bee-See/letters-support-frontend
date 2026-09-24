import { Fragment } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  /** Omit for the current page. */
  to?: string
}

// .breadcrumb from style.css; inline styles as in solidarity-site/prisoner-profile.html.
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <div className="breadcrumb">
      <div className="wrap" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && <span>/</span>}
            {item.to ? <Link to={item.to}>{item.label}</Link> : <span style={{ color: 'var(--text)' }}>{item.label}</span>}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
