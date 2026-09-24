import { Outlet } from 'react-router-dom'
import AdminBar from './AdminBar'
import Header from './Header'
import Footer from './Footer'

// The prototype's public pages have header and footer; the sign-in and
// signed-in pages have the header only.

export function SiteLayout() {
  return (
    <>
      <AdminBar />
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
