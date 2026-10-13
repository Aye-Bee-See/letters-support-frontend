import { Fragment } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  /** Omit for the current page. */
  to?: string
}

// .breadcrumb from style.css, with the row and the current page as in
// solidarity-site/prisoner-profile.html (.breadcrumb-trail, .breadcrumb-current).
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <div className="breadcrumb">
      <div className="wrap breadcrumb-trail">
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && <span>/</span>}
            {item.to ? <Link to={item.to}>{item.label}</Link> : <span className="breadcrumb-current">{item.label}</span>}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
