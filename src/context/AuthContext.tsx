import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setAuthToken, setUnauthorizedHandler } from '../api/client'
import { AuthContext, type AuthState } from './auth-context'
import type { KeyBundle, LoginResult, User } from '../types'

interface Session {
  user: User
  token: string
  expires: number
  keys: KeyBundle | null
}

// The session lives in React state only: never localStorage or sessionStorage.
// A page refresh signs the user out; accepted for v1.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)

  const startSession = useCallback((result: LoginResult) => {
    setAuthToken(result.token.token)
    setSession({
      user: result.user,
      token: result.token.token,
      expires: result.token.expires,
      keys: result.keys ?? null,
    })
  }, [])

  const endSession = useCallback(() => {
    setAuthToken(null)
    setSession(null)
  }, [])

  // An expired or revoked token anywhere ends the session.
  useEffect(() => {
    setUnauthorizedHandler(endSession)
    return () => setUnauthorizedHandler(null)
  }, [endSession])

  // Tokens last a week; end the session when this one runs out.
  useEffect(() => {
    if (!session) return
    // Already expired: the timer fires at once. setTimeout overflows above
    // ~24.8 days; a week is well under that.
    const remaining = Math.max(session.expires - Date.now(), 0)
    const timer = window.setTimeout(endSession, remaining)
    return () => window.clearTimeout(timer)
  }, [session, endSession])

  const value = useMemo<AuthState>(() => {
    const role = session?.user.role
    return {
      user: session?.user ?? null,
      token: session?.token ?? null,
      expires: session?.expires ?? null,
      keys: session?.keys ?? null,
      isAuthenticated: session !== null,
      isAdmin: role === 'admin',
      isChapter: role === 'chapter',
      isWriter: role === 'user',
      startSession,
      endSession,
    }
  }, [session, startSession, endSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
