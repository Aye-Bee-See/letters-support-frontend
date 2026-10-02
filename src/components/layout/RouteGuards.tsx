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
  const { user, isAuthenticated, twoFactorSetupRequired } = useAuth()
  const location = useLocation()

  if (!isAuthenticated || !user) return <Navigate to="/login" replace state={{ from: location }} />
  if (twoFactorSetupRequired && location.pathname !== SECURITY_PATH) return <Navigate to={SECURITY_PATH} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

/** Superadmin routes: anyone else goes to /admin/login. */
export function RequireAdmin() {
  const { user, isAuthenticated, twoFactorSetupRequired } = useAuth()
  const location = useLocation()

  if (!isAuthenticated || user?.role !== 'admin') return <Navigate to="/admin/login" replace state={{ from: location }} />
  if (twoFactorSetupRequired) return <Navigate to={SECURITY_PATH} replace />
  return <Outlet />
}

function homeFor(role: UserRole): string {
  return role === 'admin' ? '/admin' : '/inbox'
}
