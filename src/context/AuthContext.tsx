import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setAuthToken, setTwoFactorSetupRequiredHandler, setUnauthorizedHandler } from '../api/client'
import { getTwoFactor } from '../api/twoFactor'
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

/** Said on the sign-in page when a session ends without the person signing out. */
const SESSION_ENDED = 'You were signed out: this session ended elsewhere, or your access changed. Sign in again.'

// The session, including unlocked private keys, lives in React state only:
// never localStorage or sessionStorage. A page refresh signs the user out;
// accepted for v1.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [endedNotice, setEndedNotice] = useState<string | null>(null)

  const startSession = useCallback((signedIn: SignedIn) => {
    const { result } = signedIn
    setAuthToken(result.token.token)
    setEndedNotice(null)
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

  const penNameChosen = useCallback((penName: string) => {
    setSession((s) => (s ? { ...s, user: { ...s.user, penName } } : s))
  }, [])

  // Memory only, like everything else in the session. The old group keypair is
  // a base64 string, which JavaScript cannot overwrite: dropping it is the most
  // a browser allows.
  const groupKeySet = useCallback((groupKeypair: Keypair | null, orgKey: NonNullable<KeyBundle['orgKey']>) => {
    setSession((s) => (s && s.keys ? { ...s, keys: { ...s.keys, orgKey }, groupKeypair } : s))
  }, [])

  const keysChanged = useCallback((changes: Partial<Omit<KeyBundle, 'orgKey'>>) => {
    setSession((s) => (s && s.keys ? { ...s, keys: { ...s.keys, ...changes } } : s))
  }, [])

  const tokenRefreshed = useCallback((token: string, expires: number) => {
    // At once, not on the next render: the next request must carry the new token.
    setAuthToken(token)
    setSession((s) => (s ? { ...s, token, expires } : s))
  }, [])

  const endSession = useCallback((notice?: string) => {
    setAuthToken(null)
    // Keys are base64 strings, which JavaScript cannot overwrite; dropping every
    // reference is the most a browser allows.
    setSession(null)
    setEndedNotice(notice ?? null)
  }, [])

  // An expired or revoked token anywhere ends the session, and the sign-in page
  // says so. The API answers the same 401 for a ban, a revocation and an expiry.
  useEffect(() => {
    setUnauthorizedHandler(() => endSession(SESSION_ENDED))
    return () => setUnauthorizedHandler(null)
  }, [endSession])

  // A refusal saying two-factor sign-in must be set up first, from any request:
  // the requirement may have been switched on after this session began. The 403
  // doesn't say why, so ask (GET /auth/two-factor still works during set-up).
  const flaggedRef = useRef(false)
  useEffect(() => {
    flaggedRef.current = Boolean(session?.twoFactorSetupRequired)
  }, [session])
  useEffect(() => {
    setTwoFactorSetupRequiredHandler(() => {
      if (flaggedRef.current) return
      flaggedRef.current = true
      const flag = (because: TwoFactorReason[]) => setSession((s) => (s ? { ...s, twoFactorSetupRequired: because } : s))
      getTwoFactor()
        .then((status) => flag(status.requiredBecause))
        .catch(() => flag([]))
    })
    return () => setTwoFactorSetupRequiredHandler(null)
  }, [])

  // Tokens last a week; end the session when this one runs out.
  useEffect(() => {
    if (!session) return
    // Already expired: the timer fires at once. setTimeout overflows above
    // ~24.8 days; a week is well under that.
    const remaining = Math.max(session.expires - Date.now(), 0)
    const timer = window.setTimeout(() => endSession(SESSION_ENDED), remaining)
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
      penNameChosen,
      groupKeySet,
      keysChanged,
      tokenRefreshed,
      isAuthenticated: session !== null,
      isAdmin: role === 'admin',
      isChapter: role === 'chapter',
      isWriter: role === 'user',
      startSession,
      endSession,
      endedNotice,
    }
  }, [session, endedNotice, startSession, endSession, twoFactorSetUp, penNameChosen, groupKeySet, keysChanged, tokenRefreshed])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
