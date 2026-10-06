import type { ReactNode } from 'react'
import type { UiClasses } from './uiClasses'

// AdminFormParts' Section and Field, with the class names passed in, for the
// parts a site admin's page and a group admin's page share (uiClasses.ts).
// With ADMIN_UI they render exactly what AdminFormParts renders.

/** A titled block of fields. */
export function Section({ classes: c, title, children }: { classes: UiClasses; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className={c.heading}>{title}</h2>
      <div className={c.body}>{children}</div>
    </section>
  )
}

export function Field({ classes: c, label, htmlFor, hint, children }: { classes: UiClasses; label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className={c.field}>
      <label className={c.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className={c.hint}>{hint}</span>}
    </div>
  )
}
