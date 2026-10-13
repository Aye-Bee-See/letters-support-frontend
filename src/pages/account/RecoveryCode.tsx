import { useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toApiError } from '../../api/client'
import { keysChangedElsewhere, prepareRecoveryCode, type PreparedRecoveryCode } from '../../auth/account'
import CurrentPasswordField from './CurrentPasswordField'
import { useAuth } from '../../hooks/useAuth'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { useSignInAgain } from './useSignInAgain'
import { refusalText } from '../../utils/refusals'

// A new recovery code for the signed-in account (README "Account keys",
// PUT /auth/keys): the remedy for a code that was lost or never saved. The
// current password opens the private key, which is locked again under a fresh
// code; the old code stops working. The "save this code" step is
// RecoveryCodeStep's markup and wording, ending here rather than in a new
// session. Markup from the claim page's classes (pages/claim.css), as the other
// account pages use.

const SECURITY = '/account/security'

const CHANGED_ELSEWHERE =
  'Your password was changed on another device, so nothing was changed here. Sign in again with your new password, then try again.'

type Step =
  | { name: 'password' }
  | { name: 'working' }
  /** Made, but the server could not be reached to save it: send the same again. */
  | { name: 'unsent'; prepared: PreparedRecoveryCode }
  | { name: 'code'; recoveryCode: string }

export default function RecoveryCode() {
  const { user, keys, keysChanged } = useAuth()
  const navigate = useNavigate()
  const signInAgain = useSignInAgain()
  const [step, setStep] = useState<Step>({ name: 'password' })
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  useLeaveGuard(step.name === 'code' && !saved, 'Your new recovery code is shown only now, and the old one no longer works. Leave without saving it?')

  async function save(prepared: PreparedRecoveryCode) {
    setStep({ name: 'working' })
    setError(null)
    try {
      await prepared.save()
      keysChanged({ hasRecovery: true })
      setStep({ name: 'code', recoveryCode: prepared.recoveryCode })
    } catch (err) {
      if (keysChangedElsewhere(err)) return signInAgain(CHANGED_ELSEWHERE)
      const e = toApiError(err)
      if (e.status === 0) {
        setError('The server couldn’t be reached, so we can’t tell whether your new code was saved. Your old code works until it is.')
        return setStep({ name: 'unsent', prepared })
      }
      setError(e.errors.length ? e.errors.join(' ') : refusalText(e))
      setStep({ name: 'password' })
    }
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!password) return setError('Enter your current password.')
    setStep({ name: 'working' })
    setError(null)
    let prepared: PreparedRecoveryCode
    try {
      prepared = await prepareRecoveryCode(keys, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      return setStep({ name: 'password' })
    }
    setPassword('')
    await save(prepared)
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Clipboard unavailable (insecure context, permissions): writing it down still works.
    }
  }

  return (
    <div className="claim-page">
      <title>Recovery code · letters.support</title>
      <div className="claim-column is-wide">
        <div className="claim-box">
          {step.name === 'code' ? (
            <div className="claim-state is-active">
              <div className="claim-header">
                <p className="claim-eyebrow">{user?.username}</p>
                <h1 className="claim-title">Save your recovery code</h1>
                <p className="claim-org-note">If you ever forget your password, this code is the only way back into your account.</p>
              </div>
              <div className="claim-body">
                <div className="claim-encryption-note">
                  <p>Your old recovery code no longer works. This one replaces it.</p>
                </div>
                <div className="claim-encryption-note recovery-code-note">
                  <p className="recovery-code">{step.recoveryCode}</p>
                  <p>
                    <button
                      type="button"
                      className="claim-show-pw is-static"
                      aria-label={copied ? 'Recovery code copied' : 'Copy the recovery code'}
                      onClick={() => copy(step.recoveryCode)}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </p>
                </div>
                <div className="claim-encryption-note">
                  <p>Write it down, or keep it in a password manager. It is shown only now.</p>
                  <p>
                    <strong>
                      If you lose both your password and your recovery code, your letters cannot be recovered by anyone — not your group, not us.
                    </strong>
                  </p>
                </div>
                <div className="claim-check-row">
                  <input type="checkbox" id="recoverySaved" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
                  <label className="claim-check-label" htmlFor="recoverySaved">
                    I have saved my recovery code somewhere safe.
                  </label>
                </div>
                <button type="button" className="claim-submit" disabled={!saved} onClick={() => navigate(SECURITY, { replace: true })}>
                  Done
                </button>
              </div>
            </div>
          ) : step.name === 'working' ? (
            <div className="claim-state is-active">
              <div className="encrypting-box">
                <div className="spinner"></div>
                <div className="encrypting-title">Making your new recovery code…</div>
              </div>
            </div>
          ) : (
            <form className="claim-state is-active" onSubmit={onSubmit} noValidate>
              <div className="claim-header">
                <p className="claim-eyebrow">{user?.username}</p>
                <h1 className="claim-title">Make a new recovery code</h1>
                <p className="claim-org-note">
                  If you forget your password, your recovery code is the only way back into your account and your letters.
                </p>
              </div>
              <div className="claim-body">
                <div className="claim-encryption-note">
                  {keys && !keys.hasRecovery && (
                    <p>
                      <strong>Your account has no recovery code yet.</strong> Make one now, while you still know your password.
                    </p>
                  )}
                  <p>
                    Make a new one if you lost yours or never saved it. <strong>Your old code stops working</strong> as soon as the new one is
                    made, and the new one is shown only once.
                  </p>
                </div>
                {error && (
                  <div className="claim-error is-visible" role="alert">
                    {error}
                  </div>
                )}
                {step.name === 'unsent' ? (
                  <button type="button" className="claim-submit" onClick={() => save(step.prepared)}>
                    Try again
                  </button>
                ) : (
                  <>
                    <CurrentPasswordField value={password} onChange={setPassword} />
                    <button type="submit" className="claim-submit">
                      Make a new recovery code
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
        </div>
        {step.name !== 'code' && (
          <Link to={SECURITY} className="claim-back">
            ← Back
          </Link>
        )}
      </div>
    </div>
  )
}
