import type { PagerClasses } from '../forms/uiClasses'

/**
 * Previous and next under a list, in one of the class sets in uiClasses.ts
 * (ADMIN_PAGER, PUBLIC_PAGER, GROUP_PAGER). Nothing when everything fits on
 * one page, unless the URL asks for a page past the end (an old link, or
 * records deleted since), which would otherwise leave an empty list and no way
 * back.
 */
export default function Pager({
  page,
  pages,
  onPage,
  classes: c,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
  classes: PagerClasses
}) {
  if (pages <= 1 && page <= pages) return null
  const button = (to: number, text: string, disabled = false) => (
    <button type="button" className={c.button} disabled={disabled} onClick={() => onPage(to)} style={disabled ? c.disabledStyle : undefined}>
      {text}
    </button>
  )
  return (
    <nav aria-label="Pages" className={c.nav} style={c.navStyle}>
      {page > pages ? (
        <>
          <span className={c.text} style={c.textStyle}>
            There {pages === 1 ? 'is only 1 page' : `are only ${pages} pages`}.
          </span>
          {button(pages, `Go to page ${pages}`)}
        </>
      ) : (
        <>
          {button(page - 1, '← Previous', page <= 1)}
          <span className={c.text} style={c.textStyle}>
            Page {page} of {pages}
          </span>
          {button(page + 1, 'Next →', page >= pages)}
        </>
      )}
    </nav>
  )
}
