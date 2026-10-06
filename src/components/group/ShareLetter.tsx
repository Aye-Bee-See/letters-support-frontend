import { useState } from 'react'
import { toApiError } from '../../api/client'
import { addEnvelope, getGroupPublicKey } from '../../api/letters'
import { envelopeFor } from '../../crypto'
import type { Chapter } from '../../types'

// Share with a partner group (README "Sending and reading letters"): give another
// group that relays for the prisoner's facility its own envelope, sealed to its
// current public key with that key's version, through POST /messaging/envelope.
// A 409 means it has one already, or rotated its key meanwhile: the key is
// fetched again and sealed once more, and if it is still refused the group
// already holds the letter.

type Outcome = { kind: 'done' | 'error'; text: string }

async function shareWith(messageId: number, partner: Chapter, contentKey: Uint8Array): Promise<Outcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = await getGroupPublicKey(partner.id)
    if (!key.publicKey) return { kind: 'error', text: `${partner.name} has no group key yet, so nothing can be shared with it.` }
    const envelope = await envelopeFor(contentKey, { readerType: 'chapter', readerId: partner.id, publicKey: key.publicKey, keyVersion: key.keyVersion })
    try {
      await addEnvelope({ message: messageId, readerType: 'chapter', readerId: partner.id, wrappedKey: envelope.wrappedKey, keyVersion: key.keyVersion })
      return { kind: 'done', text: `Shared: ${partner.name} can read this letter now.` }
    } catch (err) {
      const error = toApiError(err)
      // Rotated while we sealed: fetch its key again and try once more.
      if (error.status === 409 && error.name === 'KeyVersionError' && attempt === 0) continue
      if (error.status === 409) return { kind: 'done', text: `${partner.name} can already read this letter.` }
      if (error.status === 400) return { kind: 'error', text: `${partner.name} can’t be given this letter: it may no longer relay for this facility.` }
      if (error.status === 403) return { kind: 'error', text: 'Only a group that can read this letter can share it.' }
      if (error.status === 0) return { kind: 'error', text: 'Couldn’t reach the server. Try again.' }
      return { kind: 'error', text: `Couldn’t share the letter (${error.status}). Try again later.` }
    }
  }
  return { kind: 'error', text: `${partner.name} changed its key twice while this was being shared. Try again.` }
}

export default function ShareLetter({ messageId, partners, contentKey }: { messageId: number; partners: Chapter[]; contentKey: Uint8Array }) {
  const [open, setOpen] = useState(false)
  const [partnerId, setPartnerId] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

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
            submit()
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
            <p className="letter-action-hint" role={outcome.kind === 'error' ? 'alert' : 'status'} style={{ color: outcome.kind === 'error' ? 'var(--alert)' : '#234d23' }}>
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
