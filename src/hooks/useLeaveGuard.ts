import { useEffect } from 'react'

// Something on screen that is shown only once (invite codes, an invitation's
// code, a claim token): leaving the page loses it for good, so the browser asks
// first. `beforeunload` covers a reload, a closed tab and a typed address; an
// in-app link (React Router's <Link>) fires none of those, so a click on one
// is caught too. The app uses BrowserRouter, where useBlocker isn't available
// (it needs a data router). Links inside an element marked
// `data-leave-guard-ok` (the panel showing the codes) are let through.

/** The parts of a click the decision reads (a MouseEvent in the browser). */
export interface ClickLike {
  target: EventTarget | null
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
}

/**
 * Whether a click follows a link to another of this app's pages, in this tab:
 * a plain left click on an `<a href>` on this origin, not `target="_blank"`
 * (or any other target), not a download, and not inside `data-leave-guard-ok`.
 * A link to this same path (a filter or a page of a list) keeps the page, and
 * what it shows, on screen.
 */
export function leavesForAppPage(click: ClickLike, here: { origin: string; pathname: string }): boolean {
  if (click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false
  const target = click.target as Element | null
  const link = typeof target?.closest === 'function' ? (target.closest('a[href]') as HTMLAnchorElement | null) : null
  if (!link) return false
  if (link.target && link.target !== '_self') return false
  if (link.hasAttribute('download') || link.closest('[data-leave-guard-ok]')) return false
  try {
    const to = new URL(link.href, here.origin)
    return to.origin === here.origin && to.pathname !== here.pathname
  } catch {
    return false
  }
}

/** While `active`, ask with `message` before an in-app link leaves the page, and let the browser ask before it unloads. */
export function useLeaveGuard(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    // Capture phase on the document: before React's own listener on the root runs the <Link>.
    const click = (e: MouseEvent) => {
      if (!leavesForAppPage(e, window.location) || window.confirm(message)) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', click, true)
    }
  }, [active, message])
}
