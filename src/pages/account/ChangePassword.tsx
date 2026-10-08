import { useState, type SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../api/client'
import { changePassword, keysChangedElsewhere } from '../../auth/account'
import NewPasswordFields from '../../components/forms/NewPasswordFields'
import { useAuth } from '../../hooks/useAuth'
import { MIN_PASSWORD_LENGTH } from '../../utils/password'
import CurrentPasswordField from './CurrentPasswordField'
import { useSignInAgain } from './useSignInAgain'

// Changing the password (PUT /auth/user, split; README "Account keys"). The
// current password opens the private key on this device; the key is locked
// under the new one, and only the new auth key and the locked copy are sent.
// The API ends every session of the account and answers a fresh token for this
// one, which the session switches to at once, or its next request would be
// refused. Markup from the claim page's classes (pages/claim.css), as the other
// account pages use.

const SECURITY = '/account/security'

type Step = { name: 'form' } | { name: 'working' } | { name: 'done' }

export default function ChangePassword() {
  const { user, keys, keysChanged, tokenRefreshed } = useAuth()
  const signInAgain = useSignInAgain()
  const [step, setStep] = useState<Step>({ name: 'form' })
  const [current, setCurrent] = useState('')
  const [pw, setPw] = useState({ password: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!user) return
    if (!current) return setError('Enter your current password.')
    if (pw.password.length < MIN_PASSWORD_LENGTH) return setError(`Your new password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (pw.password !== pw.confirm) return setError('The new passwords do not match.')
    if (pw.password === current) return setError('That is your current password. Choose a new one.')
    setStep({ name: 'working' })
    setError(null)
    try {
      const changed = await changePassword(user.id, keys, current, pw.password)
      // The change ended every session, this one's old token included.
      if (!changed.token) return signInAgain('Your password is changed. Sign in with your new password.')
      tokenRefreshed(changed.token.token, changed.token.expires)
      keysChanged(changed.fields)
      setCurrent('')
      setPw({ password: '', confirm: '' })
      setStep({ name: 'done' })
    } catch (err) {
      setStep({ name: 'form' })
      // Refused on this device before anything was sent: a wrong current password (CurrentPasswordError).
      if (err instanceof Error) return setError(err.message)
      const apiError = toApiError(err)
      if (keysChangedElsewhere(err) || apiError.status === 409) {
        // KeyChangeError, or AuthSchemeError: the account changed under this session.
        return signInAgain('Your password was changed on another device, so nothing was changed here. Sign in with your current password.')
      }
      if (apiError.status === 0) {
        return setError(
          'The server couldn’t be reached, so we can’t tell whether your password was changed. If you are signed out, sign in with your new password; if not, your old one still works.',
        )
      }
      setError(apiError.errors.length ? apiError.errors.join(' ') : apiError.message)
    }
  }

  return (
    <div className="claim-page">
      <div style={{ width: '100%', maxWidth: '460px' }}>
        <div className="claim-box">
          {step.name === 'working' ? (
            <div className="claim-state is-active">
              <div className="encrypting-box">
                <div className="spinner"></div>
                <div className="encrypting-title">Changing your password…</div>
              </div>
            </div>
          ) : step.name === 'done' ? (
            <div className="claim-state is-active">
              <div className="claim-header">
                <p className="claim-eyebrow">{user?.username}</p>
                <h1 className="claim-title">Your password is changed</h1>
              </div>
              <div className="claim-body">
                <div className="claim-encryption-note">
                  <p>Every other device signed in to your account, the apps included, is now signed out. Sign in there with your new password.</p>
                  <p>Your recovery code is unchanged and still works.</p>
                </div>
                <Link to={SECURITY} className="claim-submit" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  Done
                </Link>
              </div>
            </div>
          ) : (
            <form className="claim-state is-active" onSubmit={onSubmit} noValidate>
              <div className="claim-header">
                <p className="claim-eyebrow">{user?.username}</p>
                <h1 className="claim-title">Change your password</h1>
                <p className="claim-org-note">Your password never leaves this device: it is what unlocks your letters here.</p>
              </div>
              <div className="claim-body">
                <div className="claim-encryption-note">
                  <p>
                    <strong>Changing it signs you out on every other device</strong>, the apps included. You stay signed in here. Your recovery code
                    stays the same.
                  </p>
                </div>
                {error && (
                  <div className="claim-error is-visible" role="alert">
                    {error}
                  </div>
                )}
                <CurrentPasswordField value={current} onChange={setCurrent} />
                <NewPasswordFields password={pw.password} confirm={pw.confirm} onChange={setPw} idPrefix="new" label="New password" />
                <button type="submit" className="claim-submit">
                  Change password
                </button>
              </div>
            </form>
          )}
        </div>
        {step.name === 'form' && (
          <Link to={SECURITY} className="claim-back">
            ← Back
          </Link>
        )}
      </div>
    </div>
  )
}
