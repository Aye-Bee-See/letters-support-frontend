import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { checkInviteCode } from '../../api/auth'
import { toApiError } from '../../api/client'
import { join, type Joined } from '../../auth/join'
import { CODE_LENGTH, normalizeCode } from '../../crypto'
import AccountFields from '../../components/forms/AccountFields'
import { accountValuesReady, emptyAccountValues } from '../../components/forms/accountValues'
import RecoveryCodeStep from '../../components/forms/RecoveryCodeStep'
import type { ApiError } from '../../types'

// No prototype for Join: markup and classes are claim.html's (pages/claim.css),
// the same journey (code, form, working, then done), with a recovery-code step.
// Wording follows the everyday-screen rule: no key language (CLAUDE.md).

type Step =
  | { name: 'enter-code' }
  | { name: 'checking' }
  | { name: 'bad-code'; error: ApiError }
  | { name: 'form'; code: string; group: string }
  | { name: 'recovery'; joined: Joined }

/** What to say about an invite code that can't be used, from the API's status and condition. */
function codeProblem(error: ApiError): { title: string; body: string } {
  if (error.status === 404) return { title: 'This invite code is not valid', body: 'Check that it was typed correctly. Letters and numbers only; dashes and spaces do not matter.' }
  switch (error.condition) {
    case 'used':
      return { title: 'This invite code has already been used', body: 'Each code works once. Ask the group that gave it to you for a new one.' }
    case 'expired':
      return { title: 'This invite code has expired', body: 'Ask the group that gave it to you for a new one.' }
    case 'cancelled':
      return { title: 'This invite code was cancelled', body: 'Ask the group that gave it to you for a new one.' }
    case 'inactive':
      return { title: 'This group cannot invite people right now', body: 'Its membership in the network is paused. Ask another group near you.' }
    default:
      return { title: 'This invite code could not be checked', body: error.message }
  }
}

export default function Join() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const codeFromLink = params.get('code') ?? ''
  const [step, setStep] = useState<Step>(codeFromLink ? { name: 'checking' } : { name: 'enter-code' })
  const [typedCode, setTypedCode] = useState('')

  async function check(code: string) {
    // Claim codes are twice as long as invite codes: a claim code typed here goes to the claim page.
    if (normalizeCode(code).length === CODE_LENGTH) {
      navigate(`/claim?token=${encodeURIComponent(code.trim())}`, { replace: true })
      return
    }
    setStep({ name: 'checking' })
    try {
      const invite = await checkInviteCode(code)
      setStep({ name: 'form', code, group: invite.chapter.name })
    } catch (err) {
      setStep({ name: 'bad-code', error: toApiError(err) })
    }
  }

  // A code in the link (the QR on a slip) is checked straight away.
  useEffect(() => {
    if (!codeFromLink) return
    if (normalizeCode(codeFromLink).length === CODE_LENGTH) {
      navigate(`/claim?token=${encodeURIComponent(codeFromLink)}`, { replace: true })
      return
    }
    let current = true
    checkInviteCode(codeFromLink)
      .then((invite) => current && setStep({ name: 'form', code: codeFromLink, group: invite.chapter.name }))
      .catch((err) => current && setStep({ name: 'bad-code', error: toApiError(err) }))
    return () => {
      current = false
    }
  }, [codeFromLink, navigate])

  return (
    <div className="claim-page">
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div className="claim-box">
          {step.name === 'enter-code' && (
            <form
              className="claim-state is-active"
              onSubmit={(e) => {
                e.preventDefault()
                if (typedCode.trim()) void check(typedCode)
              }}
            >
              <div className="claim-header">
                <p className="claim-eyebrow">Join</p>
                <h1 className="claim-title">Enter your invite code</h1>
                <p className="claim-org-note">It is on the slip a group gave you, like XXXX-XXXX-XXXX.</p>
              </div>
              <div className="claim-body">
                <div className="claim-field">
                  <label className="claim-label" htmlFor="joinCode">
                    Invite code
                  </label>
                  <input
                    className="claim-input"
                    id="joinCode"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={typedCode}
                    onChange={(e) => setTypedCode(e.target.value)}
                  />
                </div>
                <button type="submit" className="claim-submit" disabled={!typedCode.trim()}>
                  Continue
                </button>
              </div>
            </form>
          )}

          {step.name === 'checking' && (
            <div className="claim-state is-active">
              <div className="encrypting-box">
                <div className="spinner"></div>
                <div className="encrypting-title">Checking your invite code…</div>
              </div>
            </div>
          )}

          {step.name === 'bad-code' && (
            <div className="claim-state is-active">
              <div className="token-error-box">
                <div className="token-error-title">{codeProblem(step.error).title}</div>
                <div className="token-error-body">
                  <p>{codeProblem(step.error).body}</p>
                  <p style={{ marginTop: '0.75rem' }}>
                    <a
                      href="/join"
                      onClick={(e) => {
                        e.preventDefault()
                        setTypedCode('')
                        setStep({ name: 'enter-code' })
                      }}
                    >
                      Try another code
                    </a>
                  </p>
                </div>
              </div>
            </div>
          )}

          {step.name === 'form' && (
            <JoinForm
              code={step.code}
              group={step.group}
              onJoined={(joined) => setStep({ name: 'recovery', joined })}
              onCodeRefused={(error) => setStep({ name: 'bad-code', error })}
            />
          )}

          {step.name === 'recovery' && <RecoveryCodeStep joined={step.joined} eyebrow="One more step" />}
        </div>

        <Link to="/" className="claim-back">
          ← Back to public site
        </Link>
      </div>
    </div>
  )
}


/**
 * The account form. It shows its own "working" view while the account is made,
 * so a refusal (a taken username or pen name) returns to the form with what was
 * typed and the API's reason.
 */
function JoinForm({
  code,
  group,
  onJoined,
  onCodeRefused,
}: {
  code: string
  group: string
  onJoined: (joined: Joined) => void
  onCodeRefused: (error: ApiError) => void
}) {
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState(emptyAccountValues)
  const [errors, setErrors] = useState<string[]>([])
  const ready = accountValuesReady(values, { penNameRequired: true })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    setErrors([])
    setBusy(true)
    try {
      onJoined(await join({ code, username: values.username, penName: values.penName, password: values.password }))
    } catch (err) {
      // Only a failure before the account is made lands here; the code still
      // works. Once it is made, a failed sign-in comes back in the result.
      const apiError = toApiError(err)
      // The code was used or cancelled in the meantime.
      if (apiError.status === 404 || apiError.status === 410) return onCodeRefused(apiError)
      setErrors(apiError.errors.length ? apiError.errors : [apiError.message])
      setBusy(false)
    }
  }

  if (busy) {
    return (
      <div className="claim-state is-active">
        <div className="encrypting-box">
          <div className="spinner"></div>
          <div className="encrypting-title">Setting up your account…</div>
          <div className="encrypting-warning">Please wait and do not refresh or leave this page.</div>
        </div>
      </div>
    )
  }

  return (
    <form className="claim-state is-active" onSubmit={onSubmit} noValidate>
      <div className="claim-header">
        <p className="claim-eyebrow">Join</p>
        <h1 className="claim-title">Create your account</h1>
        <p className="claim-org-note">
          Your invite comes from <strong>{group}</strong>.
        </p>
      </div>

      <div className="claim-body">
        <div className="claim-encryption-note">
          <p>
            <strong>Your password never leaves this device.</strong>
          </p>
          <p>Only you, and the group that prints and mails your letters, can read them. Not the people who run this site.</p>
          <p>
            <Link to="/about">How is this protected?</Link>
          </p>
        </div>

        {errors.length > 0 && <span className="claim-error is-visible">{errors.join(' ')}</span>}

        <AccountFields
          values={values}
          onChange={setValues}
          idPrefix="join"
          penNameHint="Your letters are signed with this, and replies are addressed to it. You can change it later."
        />

        <button type="submit" className="claim-submit" disabled={!ready}>
          Create account
        </button>
      </div>
    </form>
  )
}
