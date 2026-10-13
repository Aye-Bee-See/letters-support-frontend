import qrcode from 'qrcode-generator'
import { startTransition, useMemo, useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { logout } from '../../api/auth'
import { confirmTwoFactor, disableTwoFactor, getTwoFactor, newRecoveryCodes, setupTwoFactor } from '../../api/twoFactor'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { ApiError, TwoFactorReason } from '../../types'
import { refusalText } from '../../utils/refusals'
import { longDate } from '../../utils/dates'

// Sign-in security: two-factor sign-in for any signed-in account (README
// "Two-factor sign-in"). Optional for everyone; a superadmin can require it of
// superadmins and group admins. While it's required and not set up, this is the
// only page that works: the API refuses everything else.
//
// Markup from the claim page's classes (pages/claim.css), as the other account
// steps use.

const BECAUSE: Record<TwoFactorReason, string> = {
  superadmins: 'it is required of every site admin',
  all_groups: 'it is required of every group’s admins',
  group: 'your group requires it of its admins',
}

type Step =
  | { name: 'status' }
  | { name: 'scan'; secret: string; otpauthUri: string }
  | { name: 'codes'; codes: string[]; title: string }

const groups = (s: string, n = 4) => s.match(new RegExp(`.{1,${n}}`, 'g'))?.join(' ') ?? s
const errorText = (err: unknown) => {
  const e = err as ApiError
  return e.errors?.length ? e.errors.join(' ') : refusalText(e)
}

export default function Security() {
  const { user, isAdmin, twoFactorSetupRequired, twoFactorSetUp } = useAuth()
  const status = useApi(getTwoFactor, [])
  const [step, setStep] = useState<Step>({ name: 'status' })
  const home = isAdmin ? '/admin' : '/inbox'

  return (
    <div className="claim-page">
      <title>Security · letters.support</title>
      <div className="claim-column is-wide">
        <div className="claim-box">
          <div className="claim-state is-active">
            <div className="claim-header">
              <p className="claim-eyebrow">{user?.username}</p>
              <h1 className="claim-title">Two-factor sign-in</h1>
              <p className="claim-org-note">
                A six-digit code from an authenticator app on your phone, asked for after your password. Anyone who learns your password still
                can’t sign in as you.
              </p>
            </div>

            <div className="claim-body">
              {twoFactorSetupRequired && step.name !== 'codes' && (
                <div className="claim-encryption-note security-required">
                  <p>
                    <strong>Set this up to continue.</strong> Two-factor sign-in is required for your account
                    {twoFactorSetupRequired.length > 0 && <> because {twoFactorSetupRequired.map((r) => BECAUSE[r]).join(' and ')}</>}. Nothing else
                    works until it’s on.
                  </p>
                </div>
              )}

              {status.loading && <p className="claim-org-note">Loading…</p>}
              {status.error && (
                <div className="claim-error is-visible" role="alert">
                  Couldn’t load your two-factor settings ({refusalText(status.error)}).{' '}
                  <button type="button" className="claim-show-pw security-link" onClick={status.reload}>
                    Try again
                  </button>
                </div>
              )}

              {status.data && step.name === 'status' && !status.data.enabled && (
                <StartSetup onStarted={(s) => setStep({ name: 'scan', ...s })} resuming={status.data.settingUp} />
              )}
              {step.name === 'scan' && (
                <Scan
                  {...step}
                  onConfirmed={(codes) => {
                    twoFactorSetUp()
                    setStep({ name: 'codes', codes, title: 'Two-factor sign-in is on' })
                  }}
                  onCancel={() => setStep({ name: 'status' })}
                />
              )}
              {step.name === 'codes' && (
                <RecoveryCodes
                  codes={step.codes}
                  title={step.title}
                  onDone={() => {
                    setStep({ name: 'status' })
                    status.reload()
                  }}
                />
              )}
              {status.data && step.name === 'status' && status.data.enabled && (
                <Enabled
                  enabledAt={status.data.enabledAt}
                  codesLeft={status.data.recoveryCodesLeft}
                  required={status.data.required}
                  onNewCodes={(codes) => setStep({ name: 'codes', codes, title: 'New recovery codes' })}
                  onDisabled={status.reload}
                />
              )}
            </div>
          </div>
        </div>
        {/* Only two-factor set-up works while it is required and not on. */}
        {!twoFactorSetupRequired && <AccountKeys />}
        {/* A writer's letters: how long they are kept, and groups not mailing them. */}
        {!twoFactorSetupRequired && user?.role === 'user' && (
          <div className="claim-box security-box">
            <div className="claim-state is-active">
              <div className="claim-header">
                <h2 className="claim-title">Your letters</h2>
              </div>
              <div className="claim-body">
                <p className="claim-org-note">
                  <Link to="/account/retention">How long your letters are kept</Link>, and keeping them longer.
                </p>
                <p className="claim-org-note">
                  <Link to="/account/blocks">Groups not mailing your letters</Link>, and the reason each gave.
                </p>
              </div>
            </div>
          </div>
        )}
        {!twoFactorSetupRequired && <SignOutEverywhere />}
        {!twoFactorSetupRequired && (
          <Link to={home} className="claim-back">
            ← Back
          </Link>
        )}
      </div>
    </div>
  )
}

/** Links to the password and recovery-code pages. */
function AccountKeys() {
  const { keys } = useAuth()
  return (
    <div className="claim-box security-box">
      <div className="claim-state is-active">
        <div className="claim-header">
          <h2 className="claim-title">Password and recovery code</h2>
          <p className="claim-org-note">
            If you forget your password, your recovery code is the only way back into your account and your letters.
          </p>
        </div>
        <div className="claim-body">
          <p className="claim-org-note">
            <Link to="/account/password">Change your password</Link>. Every other device signed in to your account is signed out.
          </p>
          {keys && !keys.hasRecovery && (
            <div className="claim-encryption-note security-required">
              <p>
                <strong>Your account has no recovery code.</strong> Make one now, while you still know your password.
              </p>
            </div>
          )}
          <p className="claim-org-note">
            <Link to="/account/recovery-code">Make a new recovery code</Link> if you lost yours or never saved it. The old one stops working.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * POST /auth/logout { everywhere: true }: every token of the account stops
 * working, this session's too, then this session ends as "Sign out" ends it.
 * For a lost phone or a computer left signed in.
 */
function SignOutEverywhere() {
  const { token, endSession } = useAuth()
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signOutEverywhere() {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await logout(token, { everywhere: true })
    } catch (err) {
      const e = err as ApiError
      setError(
        e.status === 0
          ? 'The server couldn’t be reached, so other devices may still be signed in. Try again.'
          : `Couldn’t sign out everywhere (${errorText(err)}).`,
      )
      setBusy(false)
      return
    }
    // As useSignOut: one transition, so this page's guard doesn't send the visitor to /login first.
    startTransition(() => {
      endSession()
      navigate('/')
    })
  }

  return (
    <div className="claim-box security-box">
      <div className="claim-state is-active">
        <div className="claim-header">
          <h2 className="claim-title">Sign out everywhere</h2>
          <p className="claim-org-note">
            Signs out every device signed in to your account, the apps included, and this one. For a lost phone, or a computer you left signed
            in.
          </p>
        </div>
        <div className="claim-body">
          {error && (
            <div className="claim-error is-visible" role="alert">
              {error}
            </div>
          )}
          {asking ? (
            <>
              <div className="claim-encryption-note security-required">
                <p>
                  <strong>Sign out on every device?</strong> Every browser and app signed in to your account, this one included, will need your
                  password again.
                </p>
              </div>
              <button type="button" className="claim-submit" disabled={busy} onClick={signOutEverywhere}>
                {busy ? 'Signing out…' : 'Yes, sign out everywhere'}
              </button>
              <p className="claim-org-note security-centred">
                <button
                  type="button"
                  className="claim-show-pw security-link"
                  disabled={busy}
                  onClick={() => {
                    setAsking(false)
                    setError(null)
                  }}
                >
                  Cancel
                </button>
              </p>
            </>
          ) : (
            <button type="button" className="claim-submit" onClick={() => setAsking(true)}>
              Sign out everywhere
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StartSetup({ onStarted, resuming }: { onStarted: (s: { secret: string; otpauthUri: string }) => void; resuming: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <div className="claim-encryption-note">
        <p>
          Two-factor sign-in is <strong>off</strong>. You’ll need an authenticator app on your phone, such as Aegis, Google Authenticator,
          Microsoft Authenticator or 1Password.
        </p>
        {resuming && <p>You started setting it up before. Starting again gives you a new code to scan; the old one won’t work.</p>}
      </div>
      {error && (
        <div className="claim-error is-visible" role="alert">
          {error}
        </div>
      )}
      <button
        type="button"
        className="claim-submit"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            onStarted(await setupTwoFactor())
          } catch (err) {
            setError(errorText(err))
            setBusy(false)
          }
        }}
      >
        {busy ? 'Starting…' : 'Set up two-factor sign-in'}
      </button>
    </>
  )
}

/** The QR code (and the secret, for typing in), then the first code from the app to switch it on. */
function Scan({ secret, otpauthUri, onConfirmed, onCancel }: { secret: string; otpauthUri: string; onConfirmed: (codes: string[]) => void; onCancel: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(otpauthUri)
    qr.make()
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  }, [otpauthUri])

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    const digits = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(digits)) return setError('Enter the six-digit code your app shows.')
    setBusy(true)
    setError(null)
    try {
      const { recoveryCodes } = await confirmTwoFactor(digits)
      onConfirmed(recoveryCodes)
    } catch (err) {
      setError((err as ApiError).status === 400 ? 'That code didn’t match. Check the time on your phone, and try the newest code.' : errorText(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="claim-encryption-note">
        <p>
          <strong>1.</strong> In your authenticator app, add an account and scan this code.
        </p>
        {/* The library's own SVG markup, built from the otpauth link the API sent. */}
        <div className="security-qr" role="img" aria-label="QR code to scan with your authenticator app" dangerouslySetInnerHTML={{ __html: svg }} />
        <p>
          Can’t scan it? Type this key into the app instead:
          <br />
          <code className="security-secret">{groups(secret)}</code>
        </p>
        <p>
          On this phone already? <a href={otpauthUri}>Open it in your authenticator app</a>.
        </p>
      </div>
      <div className="claim-field">
        <label className="claim-label" htmlFor="tf-code">
          2. Enter the six-digit code the app now shows
        </label>
        <input
          className="claim-input"
          id="tf-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          disabled={busy}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      {error && (
        <div className="claim-error is-visible" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="claim-submit" disabled={busy}>
        {busy ? 'Checking…' : 'Switch it on'}
      </button>
      <p className="claim-org-note security-centred">
        <button type="button" className="claim-show-pw security-link" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </p>
    </form>
  )
}

/** Save the recovery codes as a text file, made here: they never leave this device another way. */
function downloadCodes(codes: string[]) {
  const text = [
    'letters.support: two-factor sign-in recovery codes',
    `Saved ${longDate(new Date())}`,
    '',
    'Each code signs you in once, in place of a code from your authenticator app.',
    'Making new codes stops these from working.',
    '',
    ...codes,
    '',
  ].join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'letters-support-recovery-codes.txt'
  a.click()
  // After the click has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** The recovery codes, shown once; the person confirms they saved them. */
function RecoveryCodes({ codes, title, onDone }: { codes: string[]; title: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const text = codes.join('\n')
  return (
    <>
      <div className="claim-encryption-note">
        <p>
          <strong>{title}.</strong> If you lose your phone, each of these codes signs you in once, in place of a code from the app. They’re shown
          only now.
        </p>
      </div>
      <ol className="security-codes">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ol>
      <p className="security-centred">
        <button
          type="button"
          className="claim-show-pw security-link"
          onClick={async () => {
            try {
              if (!navigator.clipboard) throw new Error('No clipboard')
              await navigator.clipboard.writeText(text)
              setCopy('copied')
            } catch {
              setCopy('failed')
            }
          }}
        >
          {copy === 'copied' ? 'Copied' : 'Copy them all'}
        </button>
        {' · '}
        <button type="button" className="claim-show-pw security-link" onClick={() => downloadCodes(codes)}>
          Download them
        </button>
      </p>
      {copy === 'failed' && <p className="claim-org-note">This browser didn’t allow copying. Select the codes and copy them, or write them down.</p>}
      <div className="claim-check-row">
        <input type="checkbox" id="codesSaved" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <label className="claim-check-label" htmlFor="codesSaved">
          I have saved these codes somewhere safe, away from my phone.
        </label>
      </div>
      <button type="button" className="claim-submit" disabled={!saved} onClick={onDone}>
        Done
      </button>
    </>
  )
}

/** On: when, how many recovery codes are left, and the two things that need a code: new recovery codes, and switching it off. */
function Enabled(props: { enabledAt: string | null; codesLeft: number; required: boolean; onNewCodes: (codes: string[]) => void; onDisabled: () => void }) {
  const { enabledAt, codesLeft, required, onNewCodes, onDisabled } = props
  const [action, setAction] = useState<'codes' | 'off' | null>(null)
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!code.trim()) return setError(useRecovery ? 'Enter one of your recovery codes.' : 'Enter the code from your app.')
    setBusy(true)
    setError(null)
    try {
      if (action === 'codes') {
        const { recoveryCodes } = await newRecoveryCodes(code.replace(/\s/g, ''))
        onNewCodes(recoveryCodes)
      } else {
        await disableTwoFactor(useRecovery ? { recoveryCode: code.trim() } : { code: code.replace(/\s/g, '') })
        onDisabled()
      }
    } catch (err) {
      const e = err as ApiError
      setError(
        e.status === 400
          ? 'That code didn’t work. Check it and try again.'
          : e.condition === 'required'
            ? 'It’s required for your account, so it can’t be switched off.'
            : errorText(err),
      )
      setBusy(false)
    }
  }

  return (
    <>
      <div className="claim-encryption-note">
        <p>
          Two-factor sign-in is <strong>on</strong>
          {enabledAt && <> (since {longDate(enabledAt)})</>}. You have {codesLeft} recovery {codesLeft === 1 ? 'code' : 'codes'} left.
        </p>
        {codesLeft <= 2 && <p>That’s not many: make a new set below.</p>}
        {required && <p>It’s required for your account, so it can’t be switched off.</p>}
      </div>

      {action === null ? (
        <>
          <button type="button" className="claim-submit" onClick={() => setAction('codes')}>
            Make new recovery codes
          </button>
          {!required && (
            <p className="claim-org-note security-centred">
              <button type="button" className="claim-show-pw security-link" onClick={() => setAction('off')}>
                Switch two-factor sign-in off
              </button>
            </p>
          )}
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="claim-field">
            <label className="claim-label" htmlFor="tf-confirm">
              {action === 'codes'
                ? 'Enter a code from your app to make new recovery codes (the old ones stop working)'
                : useRecovery
                  ? 'Enter a recovery code to switch it off'
                  : 'Enter a code from your app to switch it off'}
            </label>
            <input
              className="claim-input"
              id="tf-confirm"
              inputMode={useRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              value={code}
              disabled={busy}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {error && (
            <div className="claim-error is-visible" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="claim-submit" disabled={busy}>
            {busy ? 'Checking…' : action === 'codes' ? 'Make new codes' : 'Switch it off'}
          </button>
          <p className="claim-org-note security-centred">
            {action === 'off' && (
              <>
                <button
                  type="button"
                  className="claim-show-pw security-link"
                  disabled={busy}
                  onClick={() => {
                    setUseRecovery((r) => !r)
                    setCode('')
                    setError(null)
                  }}
                >
                  {useRecovery ? 'Use a code from my app' : 'Use a recovery code'}
                </button>
                {' · '}
              </>
            )}
            <button
              type="button"
              className="claim-show-pw security-link"
              disabled={busy}
              onClick={() => {
                setAction(null)
                setCode('')
                setUseRecovery(false)
                setError(null)
              }}
            >
              Cancel
            </button>
          </p>
        </form>
      )}
    </>
  )
}
