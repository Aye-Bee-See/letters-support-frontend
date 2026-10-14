import type { ReactNode } from 'react'
import { hintId, linkHint } from './linkHint'

// Building blocks for the admin edit forms (prisoner, facility), styled by admin.css.

/** A titled block of fields inside an .admin-form. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="admin-form-header">{title}</h2>
      <div className="admin-form-body">{children}</div>
    </section>
  )
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={htmlFor}>
        {label}
      </label>
      {linkHint(children, htmlFor, hint)}
      {hint && (
        <span className="form-hint" id={hintId(htmlFor)}>
          {hint}
        </span>
      )}
    </div>
  )
}
