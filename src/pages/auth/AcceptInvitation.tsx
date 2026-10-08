import { useEffect, useState, type SubmitEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../api/client'
import { getInvitationInfo, type InvitationInfo } from '../../api/invitations'
import { accept } from '../../auth/acceptInvitation'
import type { Joined } from '../../auth/join'
import AccountFields from '../../components/forms/AccountFields'
import { accountValuesReady, emptyAccountValues } from '../../components/forms/accountValues'
import RecoveryCodeStep from '../../components/forms/RecoveryCodeStep'
import type { ApiError, ChapterService, NetworkRole } from '../../types'
import { SERVICE_LABELS } from '../../utils/groups'

// Accepting an invitation (README "Invitations"): a new group joining the
// network, or a person joining a group. The same journey as Join (code, form,
// working, recovery code), with the claim page's markup (pages/claim.css).
// The token arrives as ?token= in the link the inviter handed over, or typed.

type Step =
  | { name: 'enter-code' }
  | { name: 'checking' }
  | { name: 'bad-code'; error: ApiError }
  | { name: 'form'; token: string; info: InvitationInfo }
  | { name: 'recovery'; joined: Joined; activation: 'immediate' | 'admin_review'; group: string }

const ROLES: Record<NetworkRole, string> = {
  collecting: 'We collect letters and pass them to a group that mails them',
  relay: 'We print and mail letters',
  both: 'We collect letters, and print and mail them',
}
const SERVICES = Object.keys(SERVICE_LABELS) as ChapterService[]
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/**
 * When the invitation stops working: a moment (14 days after it was made), not a
 * calendar day, so it's shown in the reader's own time zone, named, with the year.
 */
const expiry = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })

/** What to say about an invitation that can't be used, from the API's status and condition. */
function codeProblem(error: ApiError): { title: string; body: string } {
  if (error.status === 404) return { title: 'This invitation code is not valid', body: 'Check that it was typed correctly. Letters and numbers only; dashes and spaces do not matter.' }
  switch (error.condition) {
    case 'expired':
      return { title: 'This invitation has expired', body: 'Ask whoever invited you to renew it: they’ll give you a new code.' }
    case 'accepted':
      return { title: 'This invitation has already been used', body: 'Each invitation works once. If that wasn’t you, tell whoever invited you.' }
    case 'revoked':
      return { title: 'This invitation was withdrawn', body: 'Ask whoever invited you about it.' }
    case 'inactive':
      return { title: 'The group behind this invitation can’t invite right now', body: 'Its membership in the network is paused. Ask whoever invited you.' }
    default:
      return { title: 'This invitation could not be checked', body: error.message }
  }
}

export default function AcceptInvitation() {
  const [params] = useSearchParams()
  const tokenFromLink = params.get('token') ?? ''
  const [step, setStep] = useState<Step>(tokenFromLink ? { name: 'checking' } : { name: 'enter-code' })
  const [typed, setTyped] = useState('')

  async function check(token: string) {
    setStep({ name: 'checking' })
    try {
      setStep({ name: 'form', token, info: await getInvitationInfo(token) })
    } catch (err) {
      setStep({ name: 'bad-code', error: toApiError(err) })
    }
  }

  // A code in the link is checked straight away.
  useEffect(() => {
    if (!tokenFromLink) return
    let current = true
    getInvitationInfo(tokenFromLink)
      .then((info) => current && setStep({ name: 'form', token: tokenFromLink, info }))
      .catch((err) => current && setStep({ name: 'bad-code', error: toApiError(err) }))
    return () => {
      current = false
    }
  }, [tokenFromLink])

  return (
    <div className="claim-page">
      <div style={{ width: '100%', maxWidth: '460px' }}>
        <div className="claim-box">
          {step.name === 'enter-code' && (
            <form
              className="claim-state is-active"
              onSubmit={(e) => {
                e.preventDefault()
                if (typed.trim()) void check(typed.trim())
              }}
            >
              <div className="claim-header">
                <p className="claim-eyebrow">Invitation</p>
                <h1 className="claim-title">Enter your invitation code</h1>
                <p className="claim-org-note">The code you were given, like XXXX-XXXX-XXXX-XXXX-XXXX-XXXX.</p>
              </div>
              <div className="claim-body">
                <div className="claim-field">
                  <label className="claim-label" htmlFor="inviteToken">
                    Invitation code
                  </label>
                  <input
                    className="claim-input"
                    id="inviteToken"
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
                <div className="encrypting-title">Checking your invitation…</div>
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
                      href="/invitation"
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
            <AcceptForm
              token={step.token}
              info={step.info}
              onAccepted={(result) => setStep({ name: 'recovery', ...result })}
              onCodeRefused={(error) => setStep({ name: 'bad-code', error })}
            />
          )}

          {step.name === 'recovery' && (
            <RecoveryCodeStep joined={step.joined} eyebrow="One more step">
              {step.activation === 'admin_review' && (
                <div className="claim-encryption-note">
                  <p>
                    <strong>{step.group} is waiting for approval.</strong> A network admin will look at it soon. Until then you can sign in and look
                    around, but your group can’t send or relay letters, add writers or suggest directory changes.
                  </p>
                </div>
              )}
            </RecoveryCodeStep>
          )}
        </div>

        <Link to="/" className="claim-back">
          ← Back to public site
        </Link>
      </div>
    </div>
  )
}

interface GroupValues {
  name: string
  subregion: string
  city: string
  country: string
  networkRole: NetworkRole
  services: Set<ChapterService>
}

/**
 * The form: the new group (for a group invitation), then the person's account.
 * It shows its own "working" view while the account is made, so a refusal (a
 * taken username or pen name) returns to the form with what was typed.
 */
function AcceptForm({
  token,
  info,
  onAccepted,
  onCodeRefused,
}: {
  token: string
  info: InvitationInfo
  onAccepted: (result: { joined: Joined; activation: 'immediate' | 'admin_review'; group: string }) => void
  onCodeRefused: (error: ApiError) => void
}) {
  const isGroup = info.kind === 'group'
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState(emptyAccountValues)
  const [email, setEmail] = useState('')
  const [realName, setRealName] = useState(isGroup ? '' : info.inviteeName)
  const [group, setGroup] = useState<GroupValues>({
    name: isGroup ? info.inviteeName : '',
    subregion: '',
    city: '',
    country: '',
    networkRole: 'collecting',
    services: new Set(),
  })
  const [errors, setErrors] = useState<string[]>([])

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const groupOk = !isGroup || (group.name.trim() !== '' && group.city.trim() !== '' && group.country.trim() !== '')
  const ready = accountValuesReady(values, { penNameRequired: true }) && emailOk && groupOk

  const setG = (patch: Partial<GroupValues>) => setGroup((g) => ({ ...g, ...patch }))

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!ready) return
    setErrors([])
    setBusy(true)
    try {
      const result = await accept({
        token,
        username: values.username,
        email,
        name: realName,
        penName: values.penName,
        password: values.password,
        group: isGroup
          ? {
              name: group.name.trim(),
              location: { city: group.city.trim() },
              ...(group.subregion.trim() ? { subregion: group.subregion.trim() } : {}),
              country: group.country.trim(),
              networkRole: group.networkRole,
              services: SERVICES.filter((s) => group.services.has(s)),
            }
          : undefined,
      })
      onAccepted({ joined: result, activation: result.activation, group: result.group })
    } catch (err) {
      // Only a failure before the account is made lands here; the invitation
      // still works. Once it is made, a failed sign-in comes back in the result.
      const apiError = toApiError(err)
      // Expired, used or withdrawn in the meantime.
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
        <p className="claim-eyebrow">Invitation</p>
        <h1 className="claim-title">{isGroup ? 'Bring your group into the network' : `Join ${info.chapter?.name ?? 'your group'}`}</h1>
        <p className="claim-org-note">
          {isGroup ? (
            info.chapter ? (
              <>
                <strong>{info.chapter.name}</strong> is vouching for your group.
              </>
            ) : (
              'A network admin invited your group.'
            )
          ) : (
            <>
              You’ll be one of <strong>{info.chapter?.name ?? 'the group'}</strong>’s admins.
            </>
          )}{' '}
          This invitation works until {expiry(info.expiresAt)}.
        </p>
      </div>

      <div className="claim-body">
        {errors.length > 0 && <span className="claim-error is-visible">{errors.join(' ')}</span>}

        {isGroup && (
          <>
            <p className="claim-label invitation-section">Your group</p>
            <div className="claim-field">
              <label className="claim-label" htmlFor="g-name">
                Group name
              </label>
              <input className="claim-input" id="g-name" value={group.name} onChange={(e) => setG({ name: e.target.value })} />
            </div>
            <div className="claim-field">
              <label className="claim-label" htmlFor="g-city">
                City
              </label>
              <input className="claim-input" id="g-city" value={group.city} onChange={(e) => setG({ city: e.target.value })} />
            </div>
            <div className="claim-field">
              <label className="claim-label" htmlFor="g-subregion">
                Area, as you’d like it shown (optional)
              </label>
              <input className="claim-input" id="g-subregion" placeholder="e.g. Portland, OR" value={group.subregion} onChange={(e) => setG({ subregion: e.target.value })} />
            </div>
            <div className="claim-field">
              <label className="claim-label" htmlFor="g-country">
                Country
              </label>
              <input className="claim-input" id="g-country" value={group.country} onChange={(e) => setG({ country: e.target.value })} />
            </div>
            <div className="claim-field">
              <label className="claim-label" htmlFor="g-role">
                What your group does
              </label>
              <select className="claim-input" id="g-role" value={group.networkRole} onChange={(e) => setG({ networkRole: e.target.value as NetworkRole })}>
                {(Object.keys(ROLES) as NetworkRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLES[r]}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="claim-field invitation-services">
              <legend className="claim-label">Services (optional)</legend>
              {SERVICES.map((s) => (
                <label key={s} className="claim-check-row">
                  <input
                    type="checkbox"
                    checked={group.services.has(s)}
                    onChange={() =>
                      setG({ services: group.services.has(s) ? new Set([...group.services].filter((x) => x !== s)) : new Set([...group.services, s]) })
                    }
                  />
                  <span className="claim-check-label">{capitalise(SERVICE_LABELS[s])}</span>
                </label>
              ))}
            </fieldset>
            <p className="claim-org-note">You can add a description, website and the rest after you join.</p>
            <p className="claim-label invitation-section">Your account</p>
          </>
        )}

        <div className="claim-encryption-note">
          <p>
            <strong>Your password never leaves this device.</strong>
          </p>
          <p>
            <Link to="/about">How is this protected?</Link>
          </p>
        </div>

        <div className="claim-field">
          <label className="claim-label" htmlFor="acc-email">
            Email
          </label>
          <input className="claim-input" id="acc-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="claim-field">
          <label className="claim-label" htmlFor="acc-name">
            Your name (optional)
          </label>
          <input className="claim-input" id="acc-name" autoComplete="name" value={realName} onChange={(e) => setRealName(e.target.value)} />
        </div>

        <AccountFields
          values={values}
          onChange={setValues}
          idPrefix="invite"
          penNameHint="Letters you send are signed with this, and replies are addressed to it. You can change it later."
        />

        <button type="submit" className="claim-submit" disabled={!ready}>
          {isGroup ? 'Create the group and my account' : 'Create my account'}
        </button>
      </div>
    </form>
  )
}
