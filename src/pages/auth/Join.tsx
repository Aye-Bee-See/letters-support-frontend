import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { checkInviteCode, checkPenName } from '../../api/auth'
import { toApiError } from '../../api/client'
import { join, type Joined } from '../../auth/join'
import { useAuth } from '../../hooks/useAuth'
import type { ApiError } from '../../types'
import { MIN_PASSWORD_LENGTH, passwordStrength } from '../../utils/password'

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
  const [params] = useSearchParams()
  const codeFromLink = params.get('code') ?? ''
  const [step, setStep] = useState<Step>(codeFromLink ? { name: 'checking' } : { name: 'enter-code' })
  const [typedCode, setTypedCode] = useState('')

  async function check(code: string) {
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
    let current = true
    checkInviteCode(codeFromLink)
      .then((invite) => current && setStep({ name: 'form', code: codeFromLink, group: invite.chapter.name }))
      .catch((err) => current && setStep({ name: 'bad-code', error: toApiError(err) }))
    return () => {
      current = false
    }
  }, [codeFromLink])

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

          {step.name === 'recovery' && <RecoveryStep joined={step.joined} />}
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
  const [username, setUsername] = useState('')
  const [penName, setPenName] = useState('')
  const [penNote, setPenNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState({ password: false, confirm: false })
  const [errors, setErrors] = useState<string[]>([])

  const strength = passwordStrength(password)
  const mismatch = confirm.length > 0 && confirm !== password
  const ready =
    username.trim().length >= 3 && penName.trim().length >= 3 && password.length >= MIN_PASSWORD_LENGTH && confirm === password && penNote?.ok !== false

  async function checkPen() {
    const name = penName.trim()
    if (name.length < 3) return setPenNote(null)
    try {
      const r = await checkPenName(name)
      if (!r.available) setPenNote({ ok: false, text: r.reason ?? 'That pen name is not available.' })
      else if (!r.twoParts) setPenNote({ ok: true, text: 'Available. A two-part name, like “James Hollow”, reads as a name to a mail room.' })
      else setPenNote({ ok: true, text: 'Available.' })
    } catch {
      setPenNote(null) // the API checks again on submit
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    setErrors([])
    setBusy(true)
    try {
      onJoined(await join({ code, username, penName, password }))
    } catch (err) {
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

        <div className="claim-field">
          <label className="claim-label" htmlFor="joinUsername">
            Username
          </label>
          <input
            className="claim-input"
            type="text"
            id="joinUsername"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={16}
            placeholder="choose a username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <span className="pw-strength-label">3 to 16 characters. You sign in with this; it is never printed.</span>
        </div>

        <div className="claim-field">
          <label className="claim-label" htmlFor="joinPenName">
            Pen name
          </label>
          <input
            className={penNote && !penNote.ok ? 'claim-input error' : 'claim-input'}
            type="text"
            id="joinPenName"
            maxLength={40}
            placeholder="e.g. James Hollow"
            value={penName}
            onChange={(e) => {
              setPenName(e.target.value)
              setPenNote(null)
            }}
            onBlur={checkPen}
          />
          <span className="pw-strength-label" style={penNote && !penNote.ok ? { color: 'var(--alert)' } : undefined}>
            {penNote?.text ?? 'Your letters are signed with this, and replies are addressed to it. You can change it later.'}
          </span>
        </div>

        <div className="claim-field">
          <label className="claim-label" htmlFor="joinPassword">
            Password
          </label>
          <div className="claim-pw-wrap">
            <input
              className="claim-input"
              type={show.password ? 'text' : 'password'}
              id="joinPassword"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="claim-show-pw" onClick={() => setShow((s) => ({ ...s, password: !s.password }))}>
              {show.password ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="pw-strength-bar">
            <div className={strength ? `pw-strength-fill ${strength.level}` : 'pw-strength-fill'}></div>
          </div>
          <span className="pw-strength-label">{strength?.label ?? `At least ${MIN_PASSWORD_LENGTH} characters.`}</span>
        </div>

        <div className="claim-field">
          <label className="claim-label" htmlFor="joinConfirm">
            Confirm password
          </label>
          <div className="claim-pw-wrap">
            <input
              className={mismatch ? 'claim-input error' : 'claim-input'}
              type={show.confirm ? 'text' : 'password'}
              id="joinConfirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button type="button" className="claim-show-pw" onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}>
              {show.confirm ? 'Hide' : 'Show'}
            </button>
          </div>
          <span className={mismatch ? 'claim-error is-visible' : 'claim-error'}>Passwords do not match.</span>
        </div>

        <button type="submit" className="claim-submit" disabled={!ready}>
          Create account
        </button>
      </div>
    </form>
  )
}

/** Shown once, straight after the account is made. The decided recovery wording (22 Sept note §2). */
function RecoveryStep({ joined }: { joined: Joined }) {
  const { startSession } = useAuth()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(joined.recoveryCode)
      setCopied(true)
    } catch {
      // Clipboard unavailable (insecure context, permissions): writing it down still works.
    }
  }

  return (
    <div className="claim-state is-active">
      <div className="claim-header">
        <p className="claim-eyebrow">One more step</p>
        <h1 className="claim-title">Save your recovery code</h1>
        <p className="claim-org-note">
          If you ever forget your password, this code is the only way back into your account.
        </p>
      </div>

      <div className="claim-body">
        <div className="claim-encryption-note" style={{ alignItems: 'center', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '1.05rem', letterSpacing: '0.06em', wordBreak: 'break-all' }}>
            {joined.recoveryCode}
          </p>
          <p>
            <button type="button" className="claim-show-pw" style={{ position: 'static' }} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </p>
        </div>

        <div className="claim-encryption-note">
          <p>Write it down, or keep it in a password manager. It is shown only now.</p>
          <p>
            <strong>
              If you lose both your password and your recovery code, your letters cannot be recovered by anyone — not
              your group, not us.
            </strong>
          </p>
        </div>

        <div className="claim-check-row">
          <input type="checkbox" id="joinSaved" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <label className="claim-check-label" htmlFor="joinSaved">
            I have saved my recovery code somewhere safe.
          </label>
        </div>

        <button
          type="button"
          className="claim-submit"
          disabled={!saved}
          onClick={() => {
            startSession(joined.signedIn)
            navigate('/inbox', { replace: true })
          }}
        >
          Go to your inbox →
        </button>
      </div>
    </div>
  )
}
