import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { UserRole } from '../../types'

/** Where two-factor sign-in is set up; while it's required and not set up, the only page that works. */
export const SECURITY_PATH = '/account/security'

/**
 * Signed-in routes. Without a session: to /login, remembering where the user
 * was going. With the wrong role: to their own home.
 */
export function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated || !user) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

/**
 * Superadmin routes. Without a session: to the one sign-in page, remembering
 * where they were going (a refresh signs out, so this is common). Signed in as
 * anyone else: to their own home.
 */
export function RequireAdmin() {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated || !user) return <Navigate to="/login" replace state={{ from: location }} />
  if (user.role !== 'admin') return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

function homeFor(role: UserRole): string {
  return role === 'admin' ? '/admin' : '/inbox'
}

/**
 * While a session must set up two-factor sign-in, every page but the security
 * page sends it there, public pages included: the API refuses this session's
 * requests anywhere else. Rendered once, above all the routes. Signing out ends
 * the session, and with it the lock.
 */
export function TwoFactorSetupLock() {
  const { isAuthenticated, twoFactorSetupRequired } = useAuth()
  const location = useLocation()
  if (isAuthenticated && twoFactorSetupRequired && location.pathname !== SECURITY_PATH) return <Navigate to={SECURITY_PATH} replace />
  return null
}
