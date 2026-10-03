import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { UserRole } from '../../types'

/** Where two-factor sign-in is set up; while it's required and not set up, the only page that works. */
export const SECURITY_PATH = '/account/security'
/** Where a writer without a pen name chooses one. */
export const PEN_NAME_PATH = '/account/pen-name'

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
  if (role === 'admin') return '/admin'
  // A banned account can't sign in (the API refuses it, and ends its sessions),
  // so this shouldn't arise; but /inbox would refuse it in turn, so not there.
  if (role === 'banned') return '/'
  return '/inbox'
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

/**
 * A writer's account made before pen names were required (30 September) may
 * have none, and letters are signed with it: until they choose one, every page
 * sends them to choose. Public pages too, since signed in they'd only lead back
 * to writing. Setting up two-factor sign-in, when required, comes first.
 */
export function PenNameLock() {
  const { user, isWriter, twoFactorSetupRequired } = useAuth()
  const location = useLocation()
  if (isWriter && user && !user.penName && !twoFactorSetupRequired && location.pathname !== PEN_NAME_PATH) {
    return <Navigate to={PEN_NAME_PATH} replace state={{ from: location }} />
  }
  return null
}
