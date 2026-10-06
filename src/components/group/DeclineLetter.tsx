import { useState } from 'react'
import { toApiError } from '../../api/client'
import { setLetterStatus } from '../../api/letters'
import type { DeclineReason, MailRule, Message } from '../../types'
import { DECLINE_REASONS, statusRefusal } from '../../utils/groupLetters'
import NoteField from './NoteField'

// "Don't send" (README "Letter lifecycle", Declined letters; API #170): the relay
// group decides not to mail a letter, while it is queued or printed, held ones
// included and without `release`. A `facility_rule` decline names one of the
// facility's own rules, offered by label. Final: the writer is told and may
// write it again. DeclineForm serves one letter here and a batch in the print
// queue (PUT /messaging/status/batch).

/**
 * The decline form. `onDecline` makes the request and resolves to the refusal to
 * show, or null when it went through. `rules` are the ones a `facility_rule`
 * decline may name; with none, `noRulesWhy` says why that reason isn't offered.
 */
export function DeclineForm({
  rules,
  noRulesWhy,
  count = 1,
  onDecline,
  onCancel,
}: {
  rules: MailRule[]
  noRulesWhy: string
  count?: number
  onDecline: (reason: DeclineReason, rule: string | null, note: string) => Promise<string | null>
  onCancel: () => void
}) {
  const [reason, setReason] = useState<DeclineReason | null>(null)
  const [rule, setRule] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const one = count === 1
  // The rules on offer can change under the form (a batch's selection): a rule no longer offered can't be sent.
  const ready = reason !== null && (reason !== 'facility_rule' || rules.some((r) => r.tag === rule))

  async function submit() {
    if (!reason || !ready) return
    setBusy(true)
    setError(null)
    const refusal = await onDecline(reason, reason === 'facility_rule' ? rule : null, note.trim())
    setBusy(false)
    if (refusal) setError(refusal)
  }

  return (
    <form
      className="letter-action-form"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <fieldset>
        <legend>Why won’t your group send {one ? 'it' : `these ${count} letters`}?</legend>
        {DECLINE_REASONS.map((r) => {
          const noRules = r.value === 'facility_rule' && rules.length === 0
          return (
            <label key={r.value}>
              <input
                type="radio"
                name="decline-reason"
                value={r.value}
                checked={reason === r.value}
                disabled={noRules}
                onChange={() => setReason(r.value)}
              />
              {r.label}
              {noRules && ` (${noRulesWhy})`}
            </label>
          )
        })}
      </fieldset>
      {reason === 'facility_rule' && rules.length > 0 && (
        <>
          <label htmlFor="decline-rule">Which of the facility’s rules?</label>
          <select id="decline-rule" value={rule} onChange={(e) => setRule(e.target.value)}>
            <option value="">Choose a rule</option>
            {rules.map((r) => (
              <option key={r.tag} value={r.tag}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="letter-action-hint">The writer is shown the rule’s name.</p>
        </>
      )}
      <NoteField id="decline-note" value={note} onChange={setNote} hint="say why, and don’t quote the letter." />
      <p className="letter-action-hint">
        {one
          ? 'The writer is told it wasn’t sent and why, and may write it again.'
          : 'Each writer is told their letter wasn’t sent and why, with this same note, and may write it again.'}{' '}
        This can’t be undone.
      </p>
      {error && (
        <p className="letter-action-hint" role="alert" style={{ color: 'var(--alert)' }}>
          {error}
        </p>
      )}
      <div className="letter-action-buttons">
        <button type="submit" className="btn btn-sm btn-primary" disabled={!ready || busy}>
          {busy ? 'Saving…' : one ? 'Don’t send it' : 'Don’t send them'}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** "Don't send" on the one-letter print page. */
export default function DeclineLetter({ message, rules, onDone }: { message: Message; rules: MailRule[]; onDone: (text: string) => void }) {
  const [open, setOpen] = useState(false)

  if (message.status !== 'queued' && message.status !== 'printed') return null

  async function decline(reason: DeclineReason, rule: string | null, note: string): Promise<string | null> {
    try {
      await setLetterStatus(message.id, { status: 'declined', reason, ...(rule ? { rule } : {}), ...(note ? { note } : {}) })
      onDone('Not sent. The writer is told why, and may write it again.')
      return null
    } catch (err) {
      const apiError = toApiError(err)
      // A rule this facility doesn't carry (any more): `not_eligible` on the field (README "Declined letters").
      return apiError.status === 400 && reason === 'facility_rule'
        ? 'That rule isn’t one of this facility’s rules any more. Reload and pick again.'
        : statusRefusal(apiError, [message.id], 'declined')
    }
  }

  return (
    <div className="letter-action">
      {!open && (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          Don’t send
        </button>
      )}
      {open && <DeclineForm rules={rules} noRulesWhy="this facility lists no mail rules" onDecline={decline} onCancel={() => setOpen(false)} />}
    </div>
  )
}
