import { useState } from 'react'
import { toApiError } from '../../api/client'
import { setLetterStatus } from '../../api/letters'
import type { Message, ReturnReason } from '../../types'
import { RETURN_REASONS, statusRefusal } from '../../utils/groupLetters'
import NoteField from './NoteField'

// "It came back" (README "Letter lifecycle", Returned mail): a mailed letter the
// post brought back, with one of six reasons and an optional note of what the
// envelope said. The writer is told, and may write it again.

export default function ReturnLetter({ message, onDone }: { message: Message; onDone: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReturnReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (message.status !== 'mailed') return null

  async function submit() {
    if (!reason) return
    setBusy(true)
    setError(null)
    try {
      await setLetterStatus(message.id, { status: 'returned', reason, ...(note.trim() ? { note: note.trim() } : {}) })
      onDone('Recorded as came back. The writer is told, and may write it again.')
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
