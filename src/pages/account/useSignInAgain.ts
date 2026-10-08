import { startTransition, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../../api/auth'
import { useAuth } from '../../hooks/useAuth'

/**
 * End this session and go to the sign-in page with a line saying why: for a
 * session whose password or keys changed elsewhere. As useSignOut, the token is
 * revoked best effort, and ending the session and navigating share one
 * transition so the page's guard does not redirect first.
 */
export function useSignInAgain(): (notice: string) => void {
  const { token, endSession } = useAuth()
  const navigate = useNavigate()
  return useCallback(
    (notice: string) => {
      if (token) logout(token).catch(() => null)
      startTransition(() => {
        endSession()
        navigate('/login', { replace: true, state: { notice } })
      })
    },
    [token, endSession, navigate],
  )
}
