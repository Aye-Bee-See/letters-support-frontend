import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setAuthToken, setUnauthorizedHandler } from '../api/client'
import type { SignedIn } from '../auth/signIn'
import type { Keypair } from '../crypto'
import { AuthContext, type AuthState } from './auth-context'
import type { KeyBundle, TwoFactorReason, User } from '../types'

interface Session {
  user: User
  token: string
  expires: number
  keys: KeyBundle | null
  keypair: Keypair | null
  groupKeypair: Keypair | null
  twoFactorSetupRequired: TwoFactorReason[] | null
}

// The session, including unlocked private keys, lives in React state only:
// never localStorage or sessionStorage. A page refresh signs the user out;
// accepted for v1.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)

  const startSession = useCallback((signedIn: SignedIn) => {
    const { result } = signedIn
    setAuthToken(result.token.token)
    setSession({
      user: result.user,
      token: result.token.token,
      expires: result.token.expires,
      keys: signedIn.bundle,
      keypair: signedIn.keypair,
      groupKeypair: signedIn.groupKeypair,
      twoFactorSetupRequired: result.twoFactor?.setupRequired ? result.twoFactor.because : null,
    })
  }, [])

  const twoFactorSetUp = useCallback(() => {
    setSession((s) => (s ? { ...s, twoFactorSetupRequired: null } : s))
  }, [])

  const endSession = useCallback(() => {
    setAuthToken(null)
    // Keys are base64 strings, which JavaScript cannot overwrite; dropping every
    // reference is the most a browser allows.
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
      keypair: session?.keypair ?? null,
      groupKeypair: session?.groupKeypair ?? null,
      twoFactorSetupRequired: session?.twoFactorSetupRequired ?? null,
      twoFactorSetUp,
      isAuthenticated: session !== null,
      isAdmin: role === 'admin',
      isChapter: role === 'chapter',
      isWriter: role === 'user',
      startSession,
      endSession,
    }
  }, [session, startSession, endSession, twoFactorSetUp])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
