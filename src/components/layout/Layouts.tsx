import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

// The prototype's public pages have header and footer; the sign-in and
// signed-in pages have the header only.

export function SiteLayout() {
  return (
    <>
      <Header />
      <Outlet />
      <Footer />
    </>
  )
}

export function SignedInLayout() {
  return (
    <>
      <Header />
      <Outlet />
    </>
  )
}
