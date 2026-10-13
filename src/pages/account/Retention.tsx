import { useState, type SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { setMyRetention } from '../../api/auth'
import { getRetention, type RetentionRules } from '../../api/letters'
import LoadState from '../../components/ui/LoadState'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { ApiError } from '../../types'
import { refusalText } from '../../utils/refusals'
import { windowChoices, windowFor, windowText } from '../../utils/retention'

// How long a writer's letters are kept (README "Retention"): the site's
// default and cap and the writer's own window from GET /messaging/retention,
// changed with PUT /auth/user { retentionDays } (null for the default, 0 for
// ever). Markup from the claim page's classes (pages/claim.css), as the other
// account pages use.

/** The form's choice: the site default, a number of days, or for ever. */
type Choice = 'default' | 'forever' | 'other' | number

const choiceOf = (rules: RetentionRules): Choice =>
  rules.chosenDays === null ? 'default' : rules.chosenDays === 0 ? 'forever' : rules.chosenDays

export default function Retention() {
  // Kept on screen while it loads again after a save.
  const rules = useApi(getRetention, [], { keepPrevious: true })
  const [saved, setSaved] = useState(false)
  return (
    <div className="claim-page">
      <title>How long letters are kept · letters.support</title>
      <div className="claim-column is-wide">
        <div className="claim-box">
          <div className="claim-state is-active">
            <div className="claim-header">
              <h1 className="claim-title">How long your letters are kept</h1>
              <p className="claim-org-note">
                Once a letter has been mailed, has come back or wasn’t sent, it is deleted after a while, with its files. So is each reply
                in your conversations: replies sit in your account, so your window covers them too.
              </p>
            </div>
            <div className="claim-body">
              <LoadState state={rules} what="your retention settings" />
              {/* Keyed on the saved choice, so the form starts again from what was saved. */}
              {rules.data && (
                <RetentionForm
                  key={String(rules.data.chosenDays)}
                  rules={rules.data}
                  saved={saved}
                  onChange={() => setSaved(false)}
                  onSaved={() => {
                    setSaved(true)
                    rules.reload()
                  }}
                />
              )}
            </div>
          </div>
        </div>
        <Link to="/account/security" className="claim-back">
          ← Back
        </Link>
      </div>
    </div>
  )
}

function RetentionForm({ rules, saved, onChange, onSaved }: { rules: RetentionRules; saved: boolean; onChange: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const [choice, setChoice] = useState<Choice>(choiceOf(rules))
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const capped = rules.maxDays !== null

  /** What the form would send: null for the default, 0 for ever, else days; undefined while "other" isn't a whole number. */
  const otherDays = /^\d+$/.test(other.trim()) ? Number(other.trim()) : undefined
  const value: number | null | undefined =
    choice === 'default' ? null : choice === 'forever' ? 0 : choice === 'other' ? (otherDays && otherDays > 0 ? otherDays : undefined) : choice
  const overCap = capped && typeof value === 'number' && value > (rules.maxDays as number)
  const newWindow = value === undefined ? undefined : windowFor(value, rules)
  // A shorter window makes older letters due at once: say so before saving.
  const shorter = newWindow !== undefined && newWindow !== null && (rules.effectiveDays === null || newWindow < rules.effectiveDays)

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!user || value === undefined || overCap) return
    setBusy(true)
    setError(null)
    onChange()
    try {
      await setMyRetention(user.id, value)
      onSaved()
    } catch (err) {
      setError(refusalText(err as ApiError))
    } finally {
      setBusy(false)
    }
  }

  const radio = (id: string, c: Choice, label: string) => (
    <div className="claim-check-row" key={id}>
      <input
        type="radio"
        id={id}
        name="retention"
        checked={choice === c}
        disabled={busy}
        onChange={() => {
          setChoice(c)
          onChange()
        }}
      />
      <label className="claim-check-label" htmlFor={id}>
        {label}
      </label>
    </div>
  )

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="claim-encryption-note">
        <p>
          {rules.effectiveDays === null ? (
            <>
              <strong>Your letters are kept for ever.</strong>
            </>
          ) : (
            <>
              <strong>Your letters are deleted {windowText(rules.effectiveDays)} after</strong> they were mailed, came back or weren’t
              sent, and replies {windowText(rules.effectiveDays)} after they arrived.
            </>
          )}{' '}
          {rules.chosenDays === null ? 'That is the site’s default.' : `You chose this; the site’s default is ${windowText(rules.defaultDays)}.`}
          {capped && ` This site keeps nothing longer than ${windowText(rules.maxDays)}.`}
        </p>
      </div>
      <p className="claim-org-note">
        Any letter or reply can be kept past your window: open it in its conversation and choose <strong>Keep</strong>. Letters still waiting to
        be printed are never deleted. A deleted letter is gone for good: it can’t be brought back, by you or by anyone.
      </p>

      <fieldset className="claim-field claim-choices">
        <legend className="claim-label">Keep my letters and replies</legend>
        {radio('ret-default', 'default', `The site’s default (${windowText(rules.defaultDays)})`)}
        {windowChoices(rules).map((d) => radio(`ret-${d}`, d, windowText(d)))}
        {radio('ret-other', 'other', 'Another number of days')}
        {choice === 'other' && (
          <>
            <label className="visually-hidden" htmlFor="ret-days">
              Number of days
            </label>
            <input
              className="claim-input"
              id="ret-days"
              inputMode="numeric"
              value={other}
              disabled={busy}
              onChange={(e) => setOther(e.target.value)}
              placeholder={capped ? `1 to ${rules.maxDays}` : 'e.g. 60'}
            />
          </>
        )}
        {/* With a cap, for ever isn't on offer: the API caps it (README "Retention"). */}
        {!capped && radio('ret-forever', 'forever', 'For ever')}
      </fieldset>

      {overCap && (
        <div className="claim-error is-visible" role="alert">
          This site keeps nothing longer than {windowText(rules.maxDays)}.
        </div>
      )}
      {shorter && (
        <div className="claim-encryption-note security-required">
          <p>
            <strong>This is shorter than now.</strong> Letters and replies already older than {windowText(newWindow)} are deleted at the next
            clean-up, within a few hours, unless you keep them first.
          </p>
        </div>
      )}
      {error && (
        <div className="claim-error is-visible" role="alert">
          {error}
        </div>
      )}
      {saved && (
        <p className="claim-org-note" role="status">
          Saved.
        </p>
      )}
      <button type="submit" className="claim-submit" disabled={busy || value === undefined || overCap}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
