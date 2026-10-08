import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react'
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom'
import { signIn, SignInError, type CodeNeeded, type SignedIn } from '../../auth/signIn'
import { SECURITY_PATH } from '../../components/layout/RouteGuards'
import { wipe } from '../../crypto'
import { useAuth } from '../../hooks/useAuth'

function failureMessage(err: unknown): string {
  if (!(err instanceof SignInError)) return 'Something went wrong. Please try again.'
  if (err.kind === 'rate_limited') {
    const minutes = err.retryAfter ? Math.ceil(err.retryAfter / 60) : null
    return minutes
      ? `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
      : 'Too many attempts. Try again later.'
  }
  // The server named sign-in costs out of bounds: nothing derived from the password left this device.
  if (err.kind === 'weak_params') {
    return 'This server asked for weaker sign-in protection than this site uses, so nothing was sent. Please tell a network admin.'
  }
  if (err.kind === 'heavy_params') {
    return 'This server asked for more sign-in work than this browser can safely do, so nothing was sent. Please tell a network admin.'
  }
  return err.message
}

// Markup and classes from solidarity-site/login.html (pages/login.css).
// The sign-in itself is src/auth/signIn.ts: the password never leaves the device.
export default function Login() {
  const { startSession } = useAuth()
  const navigate = useNavigate()
  const state = useLocation().state as { from?: Location; notice?: string } | null
  const from = state?.from
  // A line from the page that sent the person here: an account was made (or a
  // password changed) but signing in straight after it didn't work.
  const notice = typeof state?.notice === 'string' ? state.notice : null

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [missing, setMissing] = useState({ username: false, password: false })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Two-factor sign-in: the password was right, and a code is needed. The
  // password is cleared at once; what the second step needs is the wrap key
  // derived from it, held as bytes in a ref (never in state) so it can be wiped:
  // once signed in, on "Start again", when the challenge expires, on leaving.
  const [pending, setPending] = useState<Omit<CodeNeeded, 'wrapKey'> | null>(null)
  const wrapKeyRef = useRef<Uint8Array | null>(null)
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)

  const forgetKey = useCallback(() => {
    const key = wrapKeyRef.current
    wrapKeyRef.current = null
    void wipe(key)
  }, [])

  // Leaving the page mid-challenge.
  useEffect(() => forgetKey, [forgetKey])

  function finish(signedIn: SignedIn) {
    forgetKey()
    setPassword('')
    startSession(signedIn)
    // Required and not set up: only setting it up works until it is.
    if (signedIn.result.twoFactor?.setupRequired) {
      navigate(SECURITY_PATH, { replace: true })
      return
    }
    const home = signedIn.result.user.role === 'admin' ? '/admin' : '/inbox'
    // Back where they were going, filters and all (a refresh on an admin list signs out).
    navigate(from ? `${from.pathname}${from.search}${from.hash}` : home, { replace: true })
  }

  const startAgain = useCallback((message: string | null = null) => {
    forgetKey()
    setPending(null)
    setCode('')
    setUseRecovery(false)
    setPassword('')
    setError(message)
  }, [forgetKey])

  // The challenge lasts five minutes; after that the code can't be used, so the
  // key goes too. A clock far off from the server's falls back to five minutes.
  useEffect(() => {
    if (!pending) return
    const left = Date.parse(pending.expiresAt) - Date.now()
    const wait = Number.isFinite(left) && left > 0 && left <= 15 * 60_000 ? left : 5 * 60_000
    const timer = window.setTimeout(() => startAgain('That took too long. Sign in again from the start.'), wait)
    return () => window.clearTimeout(timer)
  }, [pending, startAgain])

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    setError(null)
    if (pending) {
      if (!code.trim()) return setError(useRecovery ? 'Enter one of your recovery codes.' : 'Enter the code from your authenticator app.')
    } else {
      const check = { username: !username.trim(), password: !password }
      setMissing(check)
      if (check.username || check.password) return
    }

    setBusy(true)
    try {
      if (pending) {
        const wrapKey = wrapKeyRef.current
        if (!wrapKey) return startAgain('That took too long. Sign in again from the start.')
        const factor = useRecovery ? { recoveryCode: code.trim() } : { code: code.replace(/\s/g, '') }
        // Nothing is derived again: the wrap key from the first step opens the keys.
        return finish(await signIn(username, { wrapKey }, { challenge: pending.challenge, factor }))
      }
      const outcome = await signIn(username, password)
      if ('codeNeeded' in outcome) {
        const { wrapKey, ...challenge } = outcome
        wrapKeyRef.current = wrapKey
        setPassword('')
        setPending(challenge)
        setBusy(false)
        return
      }
      finish(outcome)
    } catch (err) {
      setBusy(false)
      if (err instanceof SignInError && err.kind === 'challenge_expired') return startAgain(err.message)
      setError(failureMessage(err))
    }
  }

  return (
    <div className="login-page">
      <div>
        <div className="login-box">
          <h1 className="login-heading">Sign in</h1>
          <p className="login-subheading">Writers, support groups and network admins all sign in here.</p>
          {notice && !pending && (
            <p className="login-notice" role="status">
              {notice}
            </p>
          )}

          <form className="login-form" onSubmit={onSubmit} noValidate>
            {pending ? (
              <div className="login-field">
                <p className="login-subheading">
                  Your account uses two-factor sign-in.{' '}
                  {useRecovery ? 'Enter one of your recovery codes.' : 'Enter the six-digit code from your authenticator app.'}
                </p>
                <label className="login-label" htmlFor="code">
                  {useRecovery ? 'Recovery code' : 'Code'}
                </label>
                <input
                  className="login-input"
                  type="text"
                  id="code"
                  autoComplete="one-time-code"
                  inputMode={useRecovery ? 'text' : 'numeric'}
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={busy}
                />
                <span className={error ? 'login-error is-visible' : 'login-error'} role="alert">
                  {error}
                </span>
                <p className="login-footer-note">
                  <button
                    type="button"
                    className="login-show-pw login-text-button"
                    onClick={() => {
                      setUseRecovery((r) => !r)
                      setCode('')
                      setError(null)
                    }}
                  >
                    {useRecovery ? 'Use a code from my app instead' : 'I don’t have my phone: use a recovery code'}
                  </button>
                  {' · '}
                  <button type="button" className="login-show-pw login-text-button" onClick={() => startAgain()}>
                    Start again
                  </button>
                </p>
              </div>
            ) : (
              <>
              <div className="login-field">
                <label className="login-label" htmlFor="username">
                  Username
                </label>
                <input
                  className={missing.username ? 'login-input error' : 'login-input'}
                  type="text"
                  id="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={busy}
                />
                <span className={missing.username ? 'login-error is-visible' : 'login-error'}>Please enter your username.</span>
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="password">
                  Password
                </label>
                <div className="login-password-wrap">
                  <input
                    className={missing.password ? 'login-input error' : 'login-input'}
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                  <button type="button" className="login-show-pw" onClick={() => setShowPassword((s) => !s)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <span className={missing.password ? 'login-error is-visible' : 'login-error'}>Please enter your password.</span>
                <span className={error ? 'login-error is-visible' : 'login-error'} role="alert">
                  {error}
                </span>
              </div>
              </>
            )}

            <button type="submit" className="login-submit" disabled={busy}>
              {/* Unlocking runs Argon2id on the device: a second or two on slower phones. */}
              {busy ? 'Signing in…' : pending ? 'Continue' : 'Sign in'}
            </button>
          </form>

          {/* 22 Sept: registration is closed; people join with an invite code or a claim code. */}
          <div className="login-footer">
            <p className="login-footer-note">
              <strong>New here?</strong> <Link to="/join">I have an invite code</Link> ·{' '}
              <Link to="/claim">I have a claim code</Link>
            </p>
            <p className="login-footer-note">
              <strong>Forgot your password?</strong> <Link to="/forgot-password">See what your options are.</Link>
            </p>
          </div>
        </div>

        <Link to="/" className="login-back">
          ← Back to public site
        </Link>
      </div>
    </div>
  )
}
