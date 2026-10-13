import { useState } from 'react'
import { toApiError } from '../../api/client'
import { addEnvelope, getGroupPublicKey } from '../../api/letters'
import { envelopeFor } from '../../crypto'
import type { Chapter } from '../../types'
import { shareRefusal, type ShareOutcome } from '../../utils/groupLetters'

// Share with a partner group (README "Sending and reading letters"): give another
// group that relays for the prisoner's facility its own envelope, sealed to its
// current public key with that key's version, through POST /messaging/envelope.
// A 409 KeyVersionError means it rotated its key meanwhile: the key is fetched
// again and sealed once more. A 409 EnvelopeError means it holds the letter
// already. shareRefusal words each answer.

async function shareWith(messageId: number, partner: Chapter, contentKey: Uint8Array): Promise<ShareOutcome> {
  // Ends by the second attempt: shareRefusal answers `retry` only to the first.
  for (let attempt = 0; ; attempt++) {
    const key = await getGroupPublicKey(partner.id)
    if (!key.publicKey) return { kind: 'error', text: `${partner.name} has no group key yet, so nothing can be shared with it.` }
    const envelope = await envelopeFor(contentKey, { readerType: 'chapter', readerId: partner.id, publicKey: key.publicKey, keyVersion: key.keyVersion })
    try {
      await addEnvelope({ message: messageId, readerType: 'chapter', readerId: partner.id, wrappedKey: envelope.wrappedKey, keyVersion: key.keyVersion })
      return { kind: 'done', text: `Shared: ${partner.name} can read this letter now.` }
    } catch (err) {
      const outcome = shareRefusal(toApiError(err), partner.name, attempt > 0)
      // Rotated while we sealed: fetch its key again and try once more.
      if (outcome === 'retry') continue
      return outcome
    }
  }
}

export default function ShareLetter({ messageId, partners, contentKey }: { messageId: number; partners: Chapter[]; contentKey: Uint8Array }) {
  const [open, setOpen] = useState(false)
  const [partnerId, setPartnerId] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null)

  async function submit() {
    const partner = partners.find((p) => String(p.id) === partnerId)
    if (!partner) return
    setBusy(true)
    setOutcome(null)
    try {
      setOutcome(await shareWith(messageId, partner, contentKey))
    } catch (err) {
      setOutcome({ kind: 'error', text: `Couldn’t share the letter (${toApiError(err).status || 'no answer'}). Try again.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="letter-action">
      {!open && (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} disabled={partners.length === 0}>
          Share with a partner group
        </button>
      )}
      {!open && partners.length === 0 && <p className="letter-action-hint">No other group relays for this facility.</p>}
      {open && (
        <form
          className="letter-action-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label htmlFor="share-partner">Another group that mails to this facility</label>
          <select id="share-partner" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">Choose a group</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="letter-action-hint">
            Every group admin who holds that group’s key will be able to read this letter. It stays in your queue: your group still prints
            and mails it.
          </p>
          {outcome && (
            <p className={`letter-action-hint ${outcome.kind === 'error' ? 'is-error' : 'is-done'}`} role={outcome.kind === 'error' ? 'alert' : 'status'}>
              {outcome.text}
            </p>
          )}
          <div className="letter-action-buttons">
            <button type="submit" className="btn btn-sm btn-primary" disabled={!partnerId || busy}>
              {busy ? 'Sharing…' : 'Share'}
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
