import { useState, type SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../api/client'
import type { Joined } from '../../auth/join'
import { completeRecovery, openRecovery, RecoveryCodeError, type OpenedRecovery } from '../../auth/recover'
import { codeParamsRefusal } from '../../auth/signIn'
import NewPasswordFields from '../../components/forms/NewPasswordFields'
import RecoveryCodeStep from '../../components/forms/RecoveryCodeStep'
import { MIN_PASSWORD_LENGTH } from '../../utils/password'

// Layout and classes from solidarity-site/forgot-password.html (pages/forgot-password.css);
// fields and the working state use claim.html's classes. The prototype said there
// is no recovery; since then recovery codes exist, and the wording here is the
// one decided on 22 September (web-dev-what-will-change §2).

type Step =
  | { name: 'start' }
  | { name: 'opening' }
  | { name: 'new-password'; opened: OpenedRecovery }
  | { name: 'saving' }
  | { name: 'done'; joined: Joined }

function startProblem(err: unknown): string {
  if (err instanceof RecoveryCodeError) return 'That recovery code does not match this account. Check it and try again.'
  const refused = codeParamsRefusal(err)
  if (refused) return refused
  const e = toApiError(err)
  if (e.status === 404) return 'We could not find an account with that username that can be recovered with a code.'
  if (e.status === 429) return 'Too many attempts. Please wait a while and try again.'
  if (e.status === 0) return 'Could not reach the server.'
  return e.message
}

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>({ name: 'start' })
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState({ password: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)

  async function onStart(e: SubmitEvent) {
    e.preventDefault()
    if (!username.trim() || !code.trim()) return
    setError(null)
    setStep({ name: 'opening' })
    try {
      const opened = await openRecovery(username, code)
      setCode('')
      setStep({ name: 'new-password', opened })
    } catch (err) {
      setError(startProblem(err))
      setStep({ name: 'start' })
    }
  }

  async function onSave(e: SubmitEvent, opened: OpenedRecovery) {
    e.preventDefault()
    if (pw.password.length < MIN_PASSWORD_LENGTH || pw.password !== pw.confirm) return
    setError(null)
    setStep({ name: 'saving' })
    try {
      const joined = await completeRecovery(opened, pw.password)
      setPw({ password: '', confirm: '' })
      setStep({ name: 'done', joined })
    } catch (err) {
      // Only a failure before the password is changed lands here. Once it is, a
      // failed sign-in comes back in the result, with the new recovery code.
      const apiError = toApiError(err)
      setError(apiError.errors.length ? apiError.errors.join(' ') : apiError.message)
      setStep({ name: 'new-password', opened })
    }
  }

  const working = (title: string) => (
    <div className="claim-state is-active">
      <div className="encrypting-box">
        <div className="spinner"></div>
        <div className="encrypting-title">{title}</div>
      </div>
    </div>
  )

  return (
    <div className="fp-page">
      <div>
        <div className="fp-box">
          {step.name === 'start' && (
            <>
              <h1 className="fp-heading">Forgot your password?</h1>
              <div className="fp-body">
                <div className="fp-option">
                  <div className="fp-option-title">If you made your own account</div>
                  <div className="fp-option-body">
                    Recover it with the recovery code you were shown when you made it.
                    <form onSubmit={onStart} style={{ marginTop: '0.9rem' }} noValidate>
                      {error && <span className="claim-error is-visible">{error}</span>}
                      <div className="claim-field">
                        <label className="claim-label" htmlFor="recUsername">
                          Username
                        </label>
                        <input
                          className="claim-input"
                          id="recUsername"
                          autoComplete="username"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                        />
                      </div>
                      <div className="claim-field">
                        <label className="claim-label" htmlFor="recCode">
                          Recovery code
                        </label>
                        <input
                          className="claim-input"
                          id="recCode"
                          autoComplete="off"
                          autoCapitalize="characters"
                          spellCheck={false}
                          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                        />
                      </div>
                      <button type="submit" className="claim-submit" disabled={!username.trim() || !code.trim()}>
                        Continue
                      </button>
                    </form>
                  </div>
                </div>

                <div className="fp-option">
                  <div className="fp-option-title">If a group made your account for you</div>
                  <div className="fp-option-body">
                    If you have not claimed it yet, ask them for a new claim code, then{' '}
                    <Link to="/claim">claim your account</Link>.
                  </div>
                </div>

                <hr className="fp-divider" />
                <p>
                  <strong>
                    If you lose both your password and your recovery code, your letters cannot be recovered by anyone —
                    not your group, not us.
                  </strong>
                </p>
                <p style={{ fontFamily: 'var(--sans)', fontSize: '0.72rem', color: 'var(--mid)', lineHeight: 1.55 }}>
                  This is on purpose: a site that could reset your password could read your letters.{' '}
                  <Link to="/about">How is this protected?</Link>
                </p>
              </div>
            </>
          )}

          {step.name === 'opening' && working('Checking your recovery code…')}

          {step.name === 'new-password' && (
            <form className="claim-state is-active" onSubmit={(e) => onSave(e, step.opened)} noValidate>
              <div className="claim-header">
                <p className="claim-eyebrow">Recovery</p>
                <h1 className="claim-title">Choose a new password</h1>
                <p className="claim-org-note">
                  Your recovery code worked. After this, you will be signed out on every other device.
                </p>
              </div>
              <div className="claim-body">
                {error && <span className="claim-error is-visible">{error}</span>}
                <NewPasswordFields
                  password={pw.password}
                  confirm={pw.confirm}
                  onChange={setPw}
                  idPrefix="rec"
                  label="New password"
                />
                <button
                  type="submit"
                  className="claim-submit"
                  disabled={pw.password.length < MIN_PASSWORD_LENGTH || pw.password !== pw.confirm}
                >
                  Set new password
                </button>
              </div>
            </form>
          )}

          {step.name === 'saving' && working('Setting your new password…')}

          {step.name === 'done' && (
            <RecoveryCodeStep
              joined={step.joined}
              eyebrow="Password changed"
              signInNotice="Your password is changed. Sign in with your new password."
            >
              <div className="claim-encryption-note">
                <p>Your old recovery code no longer works. This new one replaces it.</p>
              </div>
            </RecoveryCodeStep>
          )}
        </div>

        <Link to="/login" className="fp-back">
          ← Back to sign in
        </Link>
      </div>
    </div>
  )
}
