import { useState } from 'react'
import { toApiError } from '../../api/client'
import { setLetterStatus } from '../../api/letters'
import type { Message } from '../../types'
import { heldReasonText, statusRefusal } from '../../utils/groupLetters'

// Mark one letter printed, or mailed (README "PUT /messaging/status"). A held
// letter is printed only on purpose: the group admin confirms, and the request
// says `release: true` (README "Moved and freed"). Returns are ReturnLetter's,
// declines DeclineLetter's.

export default function MarkLetter({ message, canPrint, onDone }: { message: Message; canPrint: boolean; onDone: (text: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target = message.status === 'queued' ? 'printed' : message.status === 'printed' ? 'mailed' : null
  if (!target) return null
  const held = target === 'printed' && !!message.heldReason

  async function mark(release: boolean) {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      await setLetterStatus(message.id, { status: target, ...(release ? { release: true } : {}) })
      onDone(target === 'printed' ? 'Marked printed. Mark it mailed once it is in the post.' : 'Marked mailed.')
    } catch (err) {
      setError(statusRefusal(toApiError(err), [message.id], target))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="letter-action">
      {!confirming && (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy || (target === 'printed' && !canPrint)}
          onClick={() => (held ? setConfirming(true) : mark(false))}
        >
          {busy ? 'Marking…' : target === 'printed' ? 'Mark printed' : 'Mark mailed'}
        </button>
      )}
      {confirming && (
        <div className="letter-action-form" role="alert">
          <p>
            <strong>{heldReasonText(message.heldReason)}.</strong>
          </p>
          <p className="letter-action-hint">Print it anyway? Only do this if you know it can still reach the person.</p>
          <div className="letter-action-buttons">
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => mark(true)}>
              {busy ? 'Marking…' : 'Yes, print anyway'}
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="letter-action-hint" role="alert" style={{ color: 'var(--alert)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
