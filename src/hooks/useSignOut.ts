import { startTransition, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

/**
 * Sign out and go to the home page: every "Sign out" uses this. Both happen in
 * one transition: React Router navigates in a transition, so ending the session
 * on its own would render first, at the old address, and a signed-in page's
 * guard would send the visitor to /login instead of home.
 */
export function useSignOut(): () => void {
  const { endSession } = useAuth()
  const navigate = useNavigate()
  return useCallback(() => {
    startTransition(() => {
      endSession()
      navigate('/')
    })
  }, [endSession, navigate])
}
