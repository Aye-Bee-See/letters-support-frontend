import { Navigate, useLocation } from 'react-router-dom'

// There is one sign-in page for everyone (superadmins land in /admin after it).
// /admin/login stays as a redirect for old links and bookmarks, passing on where
// the person was going.
export default function AdminLogin() {
  return <Navigate to="/login" replace state={useLocation().state} />
}
