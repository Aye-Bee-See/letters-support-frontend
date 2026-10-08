import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// BrowserRouter keeps the scroll position across navigation. Start each new page
// at the top; query-only changes (filter chips) keep the position. After a
// navigation (not the first load), focus moves to the new page's heading, so a
// screen reader announces it and Tab starts from it rather than from the link
// that was followed. A page still loading has no heading yet, and focus stays.
export default function ScrollToTop() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    window.scrollTo(0, 0)
    if (first.current) {
      first.current = false
      return
    }
    const heading = document.querySelector<HTMLElement>('main h1, h1')
    if (!heading) return
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    heading.focus({ preventScroll: true })
  }, [pathname])
  return null
}
