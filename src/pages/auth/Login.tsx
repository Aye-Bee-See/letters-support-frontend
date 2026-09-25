import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom'
import { signIn, SignInError } from '../../auth/signIn'
import { useAuth } from '../../hooks/useAuth'

function failureMessage(err: unknown): string {
  if (!(err instanceof SignInError)) return 'Something went wrong. Please try again.'
  if (err.kind === 'rate_limited') {
    const minutes = err.retryAfter ? Math.ceil(err.retryAfter / 60) : null
    return minutes
      ? `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
      : 'Too many attempts. Try again later.'
  }
  return err.message
}

// Markup and classes from solidarity-site/login.html (pages/login.css).
// The sign-in itself is src/auth/signIn.ts: the password never leaves the device.
export default function Login() {
  const { startSession } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: Location } | null)?.from

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [missing, setMissing] = useState({ username: false, password: false })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const check = { username: !username.trim(), password: !password }
    setMissing(check)
    setError(null)
    if (check.username || check.password) return

    setBusy(true)
    try {
      const signedIn = await signIn(username, password)
      setPassword('')
      startSession(signedIn)
      const home = signedIn.result.user.role === 'admin' ? '/admin' : '/inbox'
      navigate(from?.pathname ?? home, { replace: true })
    } catch (err) {
      setError(failureMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div>
        <div className="login-box">
          <h1 className="login-heading">Sign in</h1>
          <p className="login-subheading">
            Writers and support groups sign in here.
            <br />
            <Link to="/admin/login" style={{ color: 'var(--mid)', fontSize: '0.72rem' }}>
              Network admins sign in separately →
            </Link>
          </p>

          <form className="login-form" onSubmit={onSubmit} noValidate>
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

            <button type="submit" className="login-submit" disabled={busy}>
              {/* Unlocking runs Argon2id on the device: a second or two on slower phones. */}
              {busy ? 'Signing in…' : 'Sign in'}
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
