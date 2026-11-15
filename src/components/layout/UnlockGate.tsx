import { useState, type SubmitEvent } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { CurrentPasswordError } from '../../auth/account'
import { unlockSession } from '../../auth/unlock'
import { KdfParamsError } from '../../crypto'
import { useAuth } from '../../hooks/useAuth'
import { useSignOut } from '../../hooks/useSignOut'

// A session restored after a reload is signed in but LOCKED: the tab remembers
// the token, never a key (issue #76; auth/restore.ts). Pages that need no key
// work at once. The ones under this gate (a layout route in App.tsx) open or
// seal letters, so a locked session is asked for its password first, once: the
// same unwrap as sign-in, on this device, with nothing sent. The page then
// opens where it was, and the other tabs of the session are unlocked with it.
//
// Which pages wait:
// - a group admin's, all of them: without the group key open, a page can't
//   tell "you hold the key" from "you were never handed it", and would say the
//   wrong one (hooks/useGroup.ts);
// - a writer's that read or write a letter. Their inbox lists conversations
//   without opening any, so it doesn't wait.
// A site admin's pages are never under this gate: they hold no letters.

/** A writer's pages under the gate that need no key. */
const WRITER_KEYLESS = ['/inbox']

export default function UnlockGate() {
  const { locked, isWriter } = useAuth()
  const { pathname } = useLocation()
  // As the router matches it: "/inbox/" is the inbox too (GroupGate does the same for its lists).
  const path = pathname.replace(/\/+$/, '') || '/'
  if (locked && !(isWriter && WRITER_KEYLESS.includes(path))) return <UnlockPrompt />
  return <Outlet />
}

function UnlockPrompt() {
  const { user, keys, unlocked } = useAuth()
  const signOut = useSignOut()
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      const { keypair, groupKeypair } = await unlockSession(keys, password)
      // The page under the gate takes it from here; this form is gone with the lock.
      unlocked(keypair, groupKeypair)
    } catch (err) {
      setError(
        err instanceof CurrentPasswordError
          ? 'That password didn’t open your keys. Check it and try again.'
          : err instanceof KdfParamsError
            ? 'This server asked for protection for your keys outside what this site accepts, so your password wasn’t used. Sign out and tell a network admin.'
            : 'Your keys couldn’t be opened here. Sign out and sign in again.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <title>Unlock your letters · Paper Kites</title>
      <div>
        <div className="login-box">
          <h1 className="login-heading">Unlock your letters</h1>
          <p className="login-subheading">
            You’re still signed in{user ? ` as ${user.username}` : ''}, but this page was reloaded or newly opened, and your keys are never kept in the browser. Enter
            your password to open them again. It isn’t sent anywhere: it opens your keys on this device.
          </p>
          <form className="login-form" onSubmit={onSubmit} noValidate>
            {/* For password managers: the account this password belongs to. */}
            <input type="text" name="username" autoComplete="username" value={user?.username ?? ''} readOnly hidden />
            <div className="login-field">
              <label className="login-label" htmlFor="unlock-password">
                Password
              </label>
              <div className="login-password-wrap">
                <input
                  className="login-input"
                  type={show ? 'text' : 'password'}
                  id="unlock-password"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
                <button type="button" className="login-show-pw" onClick={() => setShow((s) => !s)}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className={error ? 'login-error is-visible' : 'login-error'} role="alert">
                {error}
              </span>
            </div>
            <button type="submit" className="login-submit" disabled={busy || !password}>
              {/* Unlocking runs Argon2id on the device: a second or two on slower phones. */}
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>
          <div className="login-footer">
            <p className="login-footer-note">
              <strong>Not you, or done for now?</strong>{' '}
              <button type="button" className="login-link-button" onClick={signOut}>
                Sign out
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
