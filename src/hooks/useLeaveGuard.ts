import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// Something on screen that is shown only once (invite codes, an invitation's
// code, a claim token): leaving the page loses it for good, so the browser asks
// first. `beforeunload` covers a reload, a closed tab and a typed address; an
// in-app link (React Router's <Link>) fires none of those, so a click on one
// is caught too. The app uses BrowserRouter, where useBlocker isn't available
// (it needs a data router). Links inside an element marked
// `data-leave-guard-ok` (the panel showing the codes) are let through.
//
// The browser's Back button fires none of those either, and BrowserRouter has
// no blocker, so with `{ back: true }` (the shown-once codes) the guard keeps a
// duplicate of the page's history entry on top while it is on, marked
// `leaveGuard`. Back then lands on the page's own entry, still showing the
// page: the guard asks, and either puts the duplicate back (stay) or goes back
// once more (leave). Turned off on the page ("I've copied it"), it takes the
// duplicate back out, so nothing is left behind. Drafts don't use it: a page
// that sends a draft navigates while the guard is on, which would leave the
// duplicate behind.

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

/** The history entry is the guard's duplicate (see above). */
export const isGuardEntry = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && (state as Record<string, unknown>).leaveGuard === true

/** Put the duplicate on top, unless it is there already. It keeps the router's own state (its key and index), so the router sees the same page. */
function pushGuardEntry() {
  if (isGuardEntry(window.history.state)) return
  const state = typeof window.history.state === 'object' && window.history.state !== null ? (window.history.state as object) : {}
  window.history.pushState({ ...state, leaveGuard: true }, '')
}

/** Back guards on now: React's StrictMode turns an effect off and on again, and the second must not lose the first's entry. */
let backGuards = 0

/**
 * While `active`, ask with `message` before an in-app link leaves the page, and
 * let the browser ask before it unloads; with `back`, ask before the Back button
 * leaves it too.
 */
export function useLeaveGuard(active: boolean, message: string, { back = false }: { back?: boolean } = {}): void {
  const navigate = useNavigate()
  useEffect(() => {
    if (!active) return
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    // Capture phase on the document: before React's own listener on the root runs the <Link>.
    const click = (e: MouseEvent) => {
      if (!leavesForAppPage(e, window.location)) return
      if (window.confirm(message)) {
        if (!back || !isGuardEntry(window.history.state)) return
        // Leaving by a link with the duplicate on top: take its place rather than add an entry after it.
        e.preventDefault()
        e.stopPropagation()
        const to = new URL(((e.target as Element).closest('a[href]') as HTMLAnchorElement).href)
        void navigate(to.pathname + to.search + to.hash, { replace: true })
        return
      }
      e.preventDefault()
      e.stopPropagation()
    }
    // Back (or Forward) moved off the duplicate onto the page's own entry.
    let leaving = false
    const pop = () => {
      if (leaving || isGuardEntry(window.history.state)) return
      if (window.confirm(message)) {
        leaving = true
        window.history.back()
      } else pushGuardEntry()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', click, true)
    if (back) {
      backGuards += 1
      pushGuardEntry()
      window.addEventListener('popstate', pop)
    }
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', click, true)
      if (!back) return
      window.removeEventListener('popstate', pop)
      backGuards -= 1
      // Turned off on the page: take the duplicate out, once React is done (StrictMode's second run keeps it), and
      // only if it is still on top (a page that navigated away has left it underneath).
      setTimeout(() => {
        if (backGuards === 0 && isGuardEntry(window.history.state)) window.history.back()
      }, 0)
    }
  }, [active, message, back, navigate])
}
