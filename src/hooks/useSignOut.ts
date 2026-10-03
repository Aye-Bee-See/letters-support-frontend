import { startTransition, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'
import { useAuth } from './useAuth'

/**
 * Sign out and go to the home page: every "Sign out" uses this. The token is
 * revoked on the server (POST /auth/logout), so it's dead even if it was
 * copied; that isn't waited for, so signing out works offline too. Clearing
 * the session and going home happen in one transition: React Router navigates
 * in a transition, so ending the session on its own would render first, at the
 * old address, and a signed-in page's guard would send the visitor to /login
 * instead of home.
 */
export function useSignOut(): () => void {
  const { token, endSession } = useAuth()
  const navigate = useNavigate()
  return useCallback(() => {
    // Best effort: offline, or already expired, the session still ends here.
    if (token) logout(token).catch(() => null)
    startTransition(() => {
      endSession()
      navigate('/')
    })
  }, [token, endSession, navigate])
}
