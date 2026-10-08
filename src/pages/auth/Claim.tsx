import { useEffect, useState, type SubmitEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getClaimInfo, type ClaimInfo } from '../../api/auth'
import { toApiError } from '../../api/client'
import { claim, claimIsUsable } from '../../auth/claim'
import { INVITE_CODE_LENGTH, normalizeCode } from '../../crypto'
import type { Joined } from '../../auth/join'
import AccountFields from '../../components/forms/AccountFields'
import { accountValuesReady, emptyAccountValues } from '../../components/forms/accountValues'
import RecoveryCodeStep from '../../components/forms/RecoveryCodeStep'
import type { ApiError } from '../../types'

// Markup and classes from solidarity-site/claim.html (pages/claim.css): the
// error, form, working and done states, with the done state replaced by the
// recovery-code step. The prototype's copy ("your password is your encryption
// key", "there is no reset") is replaced: recovery codes exist, and everyday
// screens use no key language (CLAUDE.md).

type Step =
  | { name: 'enter-code' }
  | { name: 'checking' }
  | { name: 'bad-code'; title: string; body: string }
  | { name: 'form'; token: string; info: ClaimInfo }
  | { name: 'recovery'; joined: Joined }

/** What to say about a claim code that can't be used. */
function codeProblem(error: ApiError): { title: string; body: string } {
  if (error.status === 404) return { title: 'This claim code is not valid', body: 'Check that it was typed correctly, or ask the group that set up your account for a new one.' }
  if (error.condition === 'used') return { title: 'This claim code has already been used', body: 'If you claimed your account, sign in instead. Otherwise, ask the group for a new code.' }
  if (error.condition === 'expired') return { title: 'This claim code has expired', body: 'Claim codes work for two weeks. Ask the group that set up your account for a new one.' }
  return { title: 'This claim code could not be checked', body: error.message }
}

const UNUSABLE = {
  title: 'This claim code cannot be used',
  body: 'It was made in a way this site no longer accepts. Ask the group that set up your account for a new one.',
}

export default function Claim() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tokenFromLink = params.get('token') ?? ''
  const [step, setStep] = useState<Step>(tokenFromLink ? { name: 'checking' } : { name: 'enter-code' })
  const [typed, setTyped] = useState('')

  const toStep = (token: string, info: ClaimInfo): Step =>
    claimIsUsable(info) ? { name: 'form', token, info } : { name: 'bad-code', ...UNUSABLE }

  async function check(token: string) {
    // Invite codes are half as long as claim codes: an invite code typed here goes to the join page.
    if (normalizeCode(token).length === INVITE_CODE_LENGTH) {
      navigate(`/join?code=${encodeURIComponent(token.trim())}`, { replace: true })
      return
    }
    setStep({ name: 'checking' })
    try {
      setStep(toStep(token, await getClaimInfo(token)))
    } catch (err) {
      setStep({ name: 'bad-code', ...codeProblem(toApiError(err)) })
    }
  }

  useEffect(() => {
    if (!tokenFromLink) return
    if (normalizeCode(tokenFromLink).length === INVITE_CODE_LENGTH) {
      navigate(`/join?code=${encodeURIComponent(tokenFromLink)}`, { replace: true })
      return
    }
    let current = true
    getClaimInfo(tokenFromLink)
      .then((info) => current && setStep(toStep(tokenFromLink, info)))
      .catch((err) => current && setStep({ name: 'bad-code', ...codeProblem(toApiError(err)) }))
    return () => {
      current = false
    }
  }, [tokenFromLink, navigate])

  return (
    <div className="claim-page">
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div className="claim-box">
          {step.name === 'enter-code' && (
            <form
              className="claim-state is-active"
              onSubmit={(e) => {
                e.preventDefault()
                if (typed.trim()) void check(typed)
              }}
            >
              <div className="claim-header">
                <p className="claim-eyebrow">Account claim</p>
                <h1 className="claim-title">Enter your claim code</h1>
                <p className="claim-org-note">The group that set up your account gave it to you.</p>
              </div>
              <div className="claim-body">
                <div className="claim-field">
                  <label className="claim-label" htmlFor="claimCode">
                    Claim code
                  </label>
                  <input
                    className="claim-input"
                    id="claimCode"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </div>
                <button type="submit" className="claim-submit" disabled={!typed.trim()}>
                  Continue
                </button>
              </div>
            </form>
          )}

          {step.name === 'checking' && (
            <div className="claim-state is-active">
              <div className="encrypting-box">
                <div className="spinner"></div>
                <div className="encrypting-title">Checking your claim code…</div>
              </div>
            </div>
          )}

          {step.name === 'bad-code' && (
            <div className="claim-state is-active">
              <div className="token-error-box">
                <div className="token-error-title">{step.title}</div>
                <div className="token-error-body">
                  <p>{step.body}</p>
                  <p style={{ marginTop: '0.75rem' }}>
                    <a
                      href="/claim"
                      onClick={(e) => {
                        e.preventDefault()
                        setTyped('')
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
            <ClaimForm
              token={step.token}
              info={step.info}
              onClaimed={(joined) => setStep({ name: 'recovery', joined })}
              onCodeRefused={(error) => setStep({ name: 'bad-code', ...codeProblem(error) })}
            />
          )}

          {step.name === 'recovery' && <RecoveryCodeStep joined={step.joined} eyebrow="Account claimed" />}
        </div>

        <Link to="/" className="claim-back">
          ← Back to public site
        </Link>
      </div>
    </div>
  )
}

function ClaimForm({
  token,
  info,
  onClaimed,
  onCodeRefused,
}: {
  token: string
  info: ClaimInfo
  onClaimed: (joined: Joined) => void
  onCodeRefused: (error: ApiError) => void
}) {
  const [busy, setBusy] = useState(false)
  // The pen name the group gave, if any: kept unless the writer changes it.
  const [values, setValues] = useState({ ...emptyAccountValues, penName: info.writer.penName ?? '' })
  const [errors, setErrors] = useState<string[]>([])
  const ready = accountValuesReady(values, { penNameRequired: true })
  const group = info.chapter?.name ?? 'Your group'

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!ready) return
    setErrors([])
    setBusy(true)
    try {
      onClaimed(await claim(info, { token, username: values.username, penName: values.penName, password: values.password }))
    } catch (err) {
      const apiError = toApiError(err)
      if (apiError.status === 404 || apiError.status === 410) return onCodeRefused(apiError)
      // status 0 with no API body: the code did not open the account (see src/auth/claim.ts).
      setErrors(
        apiError.errors.length
          ? apiError.errors
          : [apiError.status ? apiError.message : 'This claim code could not open the account. Ask the group for a new one.'],
      )
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
        <p className="claim-eyebrow">Account claim</p>
        <h1 className="claim-title">Set up your account</h1>
        <p className="claim-org-note">
          This account was created for {info.writer.name ? <strong>{info.writer.name}</strong> : 'you'} by{' '}
          <strong>{group}</strong>. Choose a username and password to make it yours.
        </p>
      </div>

      <div className="claim-body">
        <div className="claim-encryption-note">
          <p>
            <strong>Once you claim it, the account is yours alone.</strong>
          </p>
          <p>
            {group} will no longer be able to write as you or see your conversations. Like any group that prints and
            mails a letter, they can still read the letters they mail for you.
          </p>
          <p>Your password never leaves this device.</p>
          <p>
            <Link to="/about">How is this protected?</Link>
          </p>
        </div>

        {errors.length > 0 && <span className="claim-error is-visible">{errors.join(' ')}</span>}

        <AccountFields
          values={values}
          onChange={setValues}
          idPrefix="claim"
          ownPenName={info.writer.penName}
          penNameHint={
            info.writer.penName
              ? `Your letters are signed with this. ${group} chose it for you; keep it, or choose your own.`
              : 'Your letters are signed with this, and replies are addressed to it. You can change it later.'
          }
        />

        <button type="submit" className="claim-submit" disabled={!ready}>
          Claim account
        </button>
      </div>
    </form>
  )
}
