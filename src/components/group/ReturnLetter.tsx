import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../api/client'
import { submitCorrection } from '../../api/corrections'
import { getFacilities } from '../../api/facilities'
import { setLetterStatus } from '../../api/letters'
import type { Message, Prison, Prisoner, ReturnReason } from '../../types'
import { RETURN_REASONS, statusRefusal } from '../../utils/groupLetters'
import { displayName } from '../../utils/prisoners'
import { commonRefusal, otherRefusal } from '../../utils/refusals'
import NoteField from './NoteField'
import { longDate } from '../../utils/dates'

// "It came back" (README "Letter lifecycle", Returned mail): a mailed letter the
// post brought back, with one of six reasons and an optional note of what the
// envelope said. The writer is told, and may write it again.
//
// A return as `transferred`, `released` or `bad_address` puts the prisoner's
// address in doubt for staff (README "What returns tell the directory"), but
// changes nothing by itself. So after one of those three the group admin is
// offered the matching directory change, proposed through POST
// /moderation/submission for a site admin to decide (README "Moderation"): the
// new facility, status `free`, or a note on the record. The page's flash comes
// once they have proposed it or said not now.

/** The three reasons that say the directory may be wrong about where the person is. */
type DirectoryReason = Extract<ReturnReason, 'transferred' | 'released' | 'bad_address'>
const DIRECTORY_REASONS: ReturnReason[] = ['transferred', 'released', 'bad_address']

const RECORDED = 'Recorded as came back. The writer is told, and may write it again.'

export default function ReturnLetter({ message, onDone }: { message: Message; onDone: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReturnReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The return is recorded; the directory change is being offered.
  const [proposing, setProposing] = useState<{ reason: DirectoryReason; note: string } | null>(null)

  if (proposing && message.prisoner_details)
    return (
      <ProposeCorrection
        prisoner={message.prisoner_details}
        reason={proposing.reason}
        returnNote={proposing.note}
        onFinish={(proposed) => {
          setProposing(null)
          onDone(proposed ? `${RECORDED} Your correction is sent to a site admin.` : RECORDED)
        }}
      />
    )
  if (message.status !== 'mailed') return null

  async function submit() {
    if (!reason) return
    setBusy(true)
    setError(null)
    try {
      await setLetterStatus(message.id, { status: 'returned', reason, ...(note.trim() ? { note: note.trim() } : {}) })
      if (DIRECTORY_REASONS.includes(reason) && message.prisoner_details) setProposing({ reason: reason as DirectoryReason, note: note.trim() })
      else onDone(RECORDED)
    } catch (err) {
      setError(statusRefusal(toApiError(err), [message.id], 'returned'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="letter-action">
      {!open && (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          It came back
        </button>
      )}
      {open && (
        <form
          className="letter-action-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <fieldset>
            <legend>Why did it come back?</legend>
            {RETURN_REASONS.map((r) => (
              <label key={r.value}>
                <input type="radio" name="return-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                {r.label}
              </label>
            ))}
          </fieldset>
          <NoteField id="return-note" value={note} onChange={setNote} hint="say what the envelope said, nothing about what the letter said." />
          {error && (
            <p className="letter-action-hint" role="alert" style={{ color: 'var(--alert)' }}>
              {error}
            </p>
          )}
          <div className="letter-action-buttons">
            <button type="submit" className="btn btn-sm btn-primary" disabled={!reason || busy}>
              {busy ? 'Saving…' : 'Record it'}
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// --- Proposing the directory change ---------------------------------------------

const today = () => longDate(new Date())

/** What the proposal offers for each reason. */
const OFFER: Record<DirectoryReason, { heading: string; why: string }> = {
  transferred: { heading: 'Propose the new facility', why: 'came back marked as moved' },
  released: { heading: 'Propose that they are free', why: 'came back saying the person has been released' },
  bad_address: { heading: 'Propose a note on the record', why: 'came back undeliverable as addressed' },
}

/** A refusal of the proposal in words (README "POST /moderation/submission"). */
function proposalRefusal(err: unknown): string {
  const e = toApiError(err)
  if (e.status === 403 && e.condition === null)
    return 'Your group can’t propose changes right now: only an active group can, and yours may be waiting for approval, or suspended.'
  return commonRefusal(e) ?? otherRefusal(e)
}

/** The facility the person has moved to, searched by name over GET /prison/prisons?q=. */
function FacilityPicker({ exclude, value, onChange }: { exclude: number | null; value: Prison | null; onChange: (p: Prison | null) => void }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ for: string; list: Prison[] | null }>({ for: '', list: [] })

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    let live = true
    const timer = window.setTimeout(() => {
      getFacilities({ q: term, page_size: 8 })
        .then((r) => live && setFound({ for: term, list: r.items }))
        .catch(() => live && setFound({ for: term, list: null }))
    }, 250)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [q])

  if (value)
    return (
      <p>
        <strong>{value.prisonName}</strong>
        {value.country ? `, ${value.country}` : ''}{' '}
        <button type="button" className="btn btn-sm" onClick={() => onChange(null)}>
          Change
        </button>
      </p>
    )
  const term = q.trim()
  const results = found.for === term ? found.list : []
  return (
    <>
      <label htmlFor="propose-facility">The facility they are at now</label>
      <input id="propose-facility" type="search" autoComplete="off" placeholder="Type part of its name" value={q} onChange={(e) => setQ(e.target.value)} />
      {term.length >= 2 && results === null && <p className="letter-action-hint">Couldn’t search the facilities. Try again.</p>}
      {term.length >= 2 && results && results.length === 0 && found.for === term && (
        <p className="letter-action-hint">No facility by that name in the directory. Say where they are in the note below.</p>
      )}
      {results && results.length > 0 && (
        <ul className="letter-history">
          {results
            .filter((p) => p.id !== exclude)
            .map((p) => (
              <li key={p.id}>
                <button type="button" className="settings-link-button" onClick={() => onChange(p)}>
                  {p.prisonName}
                  {p.country ? `, ${p.country}` : ''}
                </button>
              </li>
            ))}
        </ul>
      )}
    </>
  )
}

function ProposeCorrection({
  prisoner,
  reason,
  returnNote,
  onFinish,
}: {
  prisoner: Prisoner
  reason: DirectoryReason
  returnNote: string
  onFinish: (proposed: boolean) => void
}) {
  const name = displayName(prisoner)
  const facility = (prisoner.prison_details ?? null) as Prison | null
  const offer = OFFER[reason]
  const [moveTo, setMoveTo] = useState<Prison | null>(null)
  const [statusNotice, setStatusNotice] = useState(
    `Mail to the listed address came back undeliverable on ${today()}; the address is being checked.`,
  )
  const [inmateID, setInmateID] = useState(prisoner.inmateID ?? '')
  const [evidence, setEvidence] = useState(
    `A letter our group mailed to ${name}${facility ? ` at ${facility.prisonName}` : ''} ${offer.why} on ${today()}.${returnNote ? ` The envelope said: “${returnNote}”.` : ''}`,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function fields(): Record<string, unknown> | null {
    if (reason === 'transferred') return moveTo ? { prison: moveTo.id } : null
    if (reason === 'released') return { status: 'free' }
    const out: Record<string, unknown> = {}
    if (statusNotice.trim()) out.statusNotice = statusNotice.trim()
    if (inmateID.trim() && inmateID.trim() !== (prisoner.inmateID ?? '')) out.inmateID = inmateID.trim()
    return Object.keys(out).length ? out : null
  }

  async function propose() {
    const proposed = fields()
    if (!proposed) return
    setBusy(true)
    setError(null)
    try {
      await submitCorrection({ resource: 'prisoner', target: prisoner.id, fields: proposed, evidence: evidence.trim() || undefined })
      setSent(true)
    } catch (err) {
      setError(proposalRefusal(err))
    } finally {
      setBusy(false)
    }
  }

  if (sent)
    return (
      <div className="letter-action letter-action-form" role="status">
        <p>
          <strong>Sent to a site admin.</strong> The directory changes only if they approve it; you’re told when they decide.
        </p>
        <div className="letter-action-buttons">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onFinish(true)}>
            Done
          </button>
        </div>
      </div>
    )

  return (
    <form
      className="letter-action letter-action-form"
      onSubmit={(e) => {
        e.preventDefault()
        void propose()
      }}
    >
      <p role="status">
        <strong>Recorded as came back.</strong> The writer is told, and may write it again.
      </p>
      <fieldset>
        <legend>{offer.heading}</legend>
        <p className="letter-action-hint">
          The directory still lists {name}
          {facility ? ` at ${facility.prisonName}` : ''}. If you know better, propose the change: a site admin decides, and nothing changes
          until they do.
        </p>
        {reason === 'transferred' && <FacilityPicker exclude={prisoner.prison} value={moveTo} onChange={setMoveTo} />}
        {reason === 'released' && <p>Their status becomes free: letters to them, waiting and new, are then held rather than mailed.</p>}
        {reason === 'bad_address' && (
          <>
            <label htmlFor="propose-notice">Note shown on their public page</label>
            <textarea id="propose-notice" value={statusNotice} onChange={(e) => setStatusNotice(e.target.value)} />
            <label htmlFor="propose-inmate">Their prisoner number, if it was wrong</label>
            <input id="propose-inmate" type="text" value={inmateID} onChange={(e) => setInmateID(e.target.value)} />
            {facility && (
              <p className="letter-action-hint">
                If the facility’s own address is wrong, propose that on <Link to={`/facilities/${facility.id}`}>its page</Link>.
              </p>
            )}
          </>
        )}
      </fieldset>
      <label htmlFor="propose-evidence">For the site admin: where this comes from</label>
      <textarea id="propose-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      <p className="letter-action-hint">
        Anything else wrong with the record? A prisoner’s record has no correction form of its own yet: say it in the box above.
      </p>
      {error && (
        <p className="letter-action-hint" role="alert" style={{ color: 'var(--alert)' }}>
          {error}
        </p>
      )}
      <div className="letter-action-buttons">
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !fields()}>
          {busy ? 'Sending…' : 'Propose it'}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onFinish(false)}>
          Not now
        </button>
      </div>
    </form>
  )
}
