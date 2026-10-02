import qrcode from 'qrcode-generator'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { confirmTwoFactor, disableTwoFactor, getTwoFactor, newRecoveryCodes, setupTwoFactor } from '../../api/twoFactor'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { ApiError, TwoFactorReason } from '../../types'

// Sign-in security: two-factor sign-in for any signed-in account (README
// "Two-factor sign-in"). Optional for everyone; a superadmin can require it of
// superadmins and group admins. While it's required and not set up, this is the
// only page that works: the API refuses everything else.
//
// Markup from the claim page's classes (pages/claim.css), as the other account
// steps use.

const BECAUSE: Record<TwoFactorReason, string> = {
  superadmins: 'it is required of every superadmin',
  all_groups: 'it is required of every group’s admins',
  group: 'your group requires it of its admins',
}

type Step =
  | { name: 'status' }
  | { name: 'scan'; secret: string; otpauthUri: string }
  | { name: 'codes'; codes: string[]; title: string }

const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const groups = (s: string, n = 4) => s.match(new RegExp(`.{1,${n}}`, 'g'))?.join(' ') ?? s
const errorText = (err: unknown) => {
  const e = err as ApiError
  return e.errors?.length ? e.errors.join(' ') : e.message
}

export default function Security() {
  const { user, isAdmin, twoFactorSetupRequired, twoFactorSetUp } = useAuth()
  const status = useApi(getTwoFactor, [])
  const [step, setStep] = useState<Step>({ name: 'status' })
  const home = isAdmin ? '/admin' : '/inbox'

  return (
    <div className="claim-page">
      <div style={{ width: '100%', maxWidth: '460px' }}>
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
                    <strong>Set this up to continue.</strong> Two-factor sign-in is required for your account because{' '}
                    {twoFactorSetupRequired.map((r) => BECAUSE[r]).join(' and ')}. Nothing else works until it’s on.
                  </p>
                </div>
              )}

              {status.loading && <p className="claim-org-note">Loading…</p>}
              {status.error && (
                <div className="claim-error" role="alert">
                  Couldn’t load your two-factor settings ({status.error.message}).{' '}
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
        {!twoFactorSetupRequired && (
          <Link to={home} className="claim-back">
            ← Back
          </Link>
        )}
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
        <div className="claim-error" role="alert">
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

  async function submit(e: FormEvent) {
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
        <div className="claim-error" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="claim-submit" disabled={busy}>
        {busy ? 'Checking…' : 'Switch it on'}
      </button>
      <p className="claim-org-note" style={{ textAlign: 'center' }}>
        <button type="button" className="claim-show-pw security-link" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </p>
    </form>
  )
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
      <p style={{ textAlign: 'center' }}>
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

  async function submit(e: FormEvent) {
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
          {enabledAt && <> (since {date(enabledAt)})</>}. You have {codesLeft} recovery {codesLeft === 1 ? 'code' : 'codes'} left.
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
            <p className="claim-org-note" style={{ textAlign: 'center' }}>
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
            <div className="claim-error" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="claim-submit" disabled={busy}>
            {busy ? 'Checking…' : action === 'codes' ? 'Make new codes' : 'Switch it off'}
          </button>
          <p className="claim-org-note" style={{ textAlign: 'center' }}>
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
