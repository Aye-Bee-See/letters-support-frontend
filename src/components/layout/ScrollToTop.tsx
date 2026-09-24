import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// BrowserRouter keeps the scroll position across navigation. Start each new page
// at the top; query-only changes (filter chips) keep the position.
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
