import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setAuthToken, setTwoFactorSetupRequiredHandler, setUnauthorizedHandler } from '../api/client'
import { getTwoFactor } from '../api/twoFactor'
import { restoreSession } from '../auth/restore'
import { canShareSessions, joinSessionChannel, type SessionChannel, type SharedSession } from '../auth/sessionChannel'
import { forgetSignIn, recallSignIn, rememberSignIn } from '../auth/sessionStore'
import type { SignedIn } from '../auth/signIn'
import type { Keypair } from '../crypto'
import { AuthContext, type AuthState } from './auth-context'
import type { KeyBundle, TwoFactorReason } from '../types'

type Session = SharedSession

/** Said on the sign-in page when a session ends without the person signing out. */
const SESSION_ENDED = 'You were signed out: this session ended elsewhere, or your access changed. Sign in again.'
/** Said in the other tabs of a session when the person signs out in one. */
const SIGNED_OUT_ELSEWHERE = 'You signed out in another tab.'

// The session lives in React state. Unlocked private keys are never written to
// any storage, localStorage and sessionStorage included: they exist in memory,
// in this tab and in the other open tabs of the same session, and nowhere else.
//
// Two things keep a person signed in without storing a key (issue #76):
// - a tab that opens with no session takes one over, keys and all, from another
//   tab that is signed in (auth/sessionChannel.ts), and the tabs then keep in
//   step: a change or a sign-out in one reaches the others;
// - a reload finds the sign-in the tab remembers (auth/sessionStore.ts: the
//   token, never a key) and comes back signed in but LOCKED, `keypair` null,
//   until the password is given to a page that needs the keys
//   (components/layout/UnlockGate.tsx).
// While either is being tried `restoring` is true, and the guards wait rather
// than send a signed-in person to the sign-in page.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [endedNotice, setEndedNotice] = useState<string | null>(null)
  // Only where there is something to try: another tab to ask, or a remembered sign-in.
  const [restoring, setRestoring] = useState(() => canShareSessions() || recallSignIn() !== null)
  /** The session as of the last commit, for what runs outside rendering: the channel, the restore, ending. */
  const sessionRef = useRef<Session | null>(null)
  const channelRef = useRef<SessionChannel | null>(null)
  /** The session another tab last sent: taken as it is, and not sent back. */
  const receivedRef = useRef<Session | null>(null)

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

  /** A restored session, locked, was unlocked with the password (auth/unlock.ts). The other tabs of the session get the keys too. */
  const unlocked = useCallback((keypair: Keypair, groupKeypair: Keypair | null) => {
    setSession((s) => (s ? { ...s, keypair, groupKeypair } : s))
  }, [])

  /** End the session in this tab only: what another tab's ending does here. */
  const endLocally = useCallback((notice?: string) => {
    setAuthToken(null)
    forgetSignIn()
    // Keys are base64 strings, which JavaScript cannot overwrite; dropping every
    // reference is the most a browser allows.
    setSession(null)
    setEndedNotice(notice ?? null)
  }, [])

  // Every tab of the session ends with it: one tab revoking the token the others
  // still use would only leave them to find out by a refusal.
  const endSession = useCallback(
    (notice?: string) => {
      const ending = sessionRef.current
      endLocally(notice)
      if (ending) channelRef.current?.announceEnded(ending.token, notice)
    },
    [endLocally],
  )

  // This tab's place among the tabs of this browser: it hands its session to a
  // tab that opens without one, and takes the changes and the ending the others
  // announce for the session it shares with them.
  useEffect(() => {
    const channel = joinSessionChannel({
      current: () => sessionRef.current,
      onChanged: (incoming) => {
        const mine = sessionRef.current
        // A tab that is still locked knows everything but the keys: this tab keeps its own.
        const next = !incoming.keypair && mine?.keypair ? { ...incoming, keypair: mine.keypair, groupKeypair: mine.groupKeypair } : incoming
        receivedRef.current = next
        setAuthToken(next.token)
        setSession(next)
      },
      onEnded: (notice) => endLocally(notice ?? SIGNED_OUT_ELSEWHERE),
    })
    channelRef.current = channel
    return () => {
      channel?.close()
      channelRef.current = null
    }
  }, [endLocally])

  // After every change: remember the sign-in for this tab's next load (the
  // token, never a key), and tell the tabs that share the session, unless the
  // change came from one of them. A session that has just begun here (a sign-in,
  // or one restored) is nobody else's yet.
  useEffect(() => {
    const previous = sessionRef.current
    sessionRef.current = session
    if (!session) return
    rememberSignIn({ token: session.token, expires: session.expires, userId: session.user.id })
    if (receivedRef.current === session) return
    if (previous) channelRef.current?.announceChanged(previous.token, session)
  }, [session])

  // Once, when the site opens: look for a session to carry on with
  // (auth/restore.ts). A session that began meanwhile stands.
  useEffect(() => {
    if (!restoring) return
    let live = true
    void restoreSession(() => sessionRef.current === null).then((found) => {
      if (!live) return
      if (found && !sessionRef.current) {
        setAuthToken(found.token)
        setEndedNotice(null)
        setSession(found)
      }
      setRestoring(false)
    })
    return () => {
      live = false
    }
    // On mount only: `restoring` is what this effect itself settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      restoring: restoring && session === null,
      locked: session !== null && session.keypair === null,
      unlocked,
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
  }, [session, endedNotice, restoring, startSession, endSession, unlocked, twoFactorSetUp, penNameChosen, groupKeySet, keysChanged, tokenRefreshed])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
