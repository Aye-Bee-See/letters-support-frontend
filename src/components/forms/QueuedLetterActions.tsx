import { useState } from 'react'
import { toApiError } from '../../api/client'
import { deleteLetter, updateLetter, type LetterFields } from '../../api/letters'
import { reencryptLetter } from '../../crypto'
import type { ApiState } from '../../hooks/useApi'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import type { Message, Prison, WriterBlock } from '../../types'
import { deleteQuestion, queuedLetterRefusal } from '../../utils/letters'

// The writer's own queued letter, on the thread page (README "Letter
// lifecycle": while a letter is queued its writer may still edit or delete it;
// "Moved and freed": a `choose_relay` hold waits for the writer to pick the
// group, `reseal_needed` for them to delete it and send it again,
// `prisoner_free` for the group, or for the writer to delete it). Editing sends
// the text, and the relay note if it has one, encrypted afresh under the
// letter's own content key, so every envelope it has still opens it ("Sending
// and reading letters").

/** The groups that mail to the prisoner's facility now, to choose from for a `choose_relay` hold. */
function ChooseGroup({
  message,
  facility,
  blocks,
  onChanged,
}: {
  message: Message
  /** The prisoner's facility with its relay groups (full=true), loaded once by the thread for the reply panel and this. */
  facility: ApiState<Prison | null>
  blocks: Map<number, WriterBlock>
  onChanged: () => void
}) {
  // Not the group it is with: one that serves the new facility keeps the letter, so it isn't the question
  // (and in end-to-end mode naming it again changes nothing, the hold included).
  const groups = (facility.data?.relay_groups ?? []).filter((g) => g.accountStatus === 'active' && !blocks.has(g.id) && g.id !== message.relayChapter)
  const [chosen, setChosen] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const group = groups.find((g) => g.id === chosen) ?? groups[0] ?? null

  async function choose() {
    if (!group) return
    setBusy(true)
    setError(null)
    try {
      await updateLetter(message.id, { relayChapter: group.id })
      onChanged()
    } catch (err) {
      setError(queuedLetterRefusal(toApiError(err), 'choose', group.name))
    } finally {
      setBusy(false)
    }
  }

  if (facility.loading) return <p className="letter-body-scan-note">Finding the groups that mail there…</p>
  if (facility.error)
    return (
      <p className="letter-body-scan-note">
        Couldn’t load the groups that mail there.{' '}
        <button type="button" className="btn btn-sm" onClick={facility.reload}>
          Try again
        </button>
      </p>
    )
  if (!group) {
    const anyGroup = (facility.data?.relay_groups ?? []).some((g) => g.accountStatus === 'active' && g.id !== message.relayChapter)
    return (
      <p className="letter-body-scan-note">
        {anyGroup
          ? `No group that mails to ${facility.data?.prisonName ?? 'this facility'} is taking your letters right now. You can delete this letter.`
          : `No group mails to ${facility.data?.prisonName ?? 'this facility'} yet. You can delete this letter, or wait until one does.`}
      </p>
    )
  }
  return (
    <>
      <p style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="letter-body-scan-note" htmlFor={`relay-${message.id}`}>
          Mailed by
        </label>
        <select id={`relay-${message.id}`} value={group.id} disabled={busy} onChange={(e) => setChosen(Number(e.target.value))}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={choose}>
          {busy ? 'Saving…' : 'Send it with this group'}
        </button>
      </p>
      {error && (
        <p className="letter-body-scan-note" style={{ color: 'var(--alert)' }}>
          {error}
        </p>
      )}
    </>
  )
}

/** What Edit needs: the letter as it reads now, and its content key (from the writer's own envelope). */
export interface EditableLetter {
  text: string
  relayNote: string | null
  contentKey: Uint8Array
}

/** The letter's text, and its note to the group if it has one, in boxes to change and save. */
function EditLetter({
  message,
  letter,
  groupName,
  onDone,
  onSaved,
}: {
  message: Message
  letter: EditableLetter
  groupName: string
  onDone: () => void
  onSaved: () => void
}) {
  const [text, setText] = useState(letter.text)
  const [note, setNote] = useState(letter.relayNote ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteChanged = letter.relayNote !== null && note !== letter.relayNote
  const changed = text !== letter.text || noteChanged
  useLeaveGuard(changed, 'Leave without saving the changes to your letter?')

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const fields: LetterFields = { ...(await reencryptLetter(text, letter.contentKey)) }
      if (noteChanged) {
        // An emptied note is taken off (the pair as nulls); otherwise it is encrypted afresh like the body.
        const sealed = note.trim() === '' ? null : await reencryptLetter(note, letter.contentKey)
        fields.relayNoteCiphertext = sealed?.ciphertext ?? null
        fields.relayNoteNonce = sealed?.nonce ?? null
      }
      await updateLetter(message.id, fields)
      onSaved()
    } catch (err) {
      setError(queuedLetterRefusal(toApiError(err), 'edit'))
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <textarea className="reply-textarea" aria-label="Your letter" value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
      {letter.relayNote !== null && (
        <>
          <label className="letter-body-scan-note" htmlFor={`relay-note-${message.id}`} style={{ display: 'block', marginTop: '0.5rem' }}>
            Note to {groupName} (not sent to the prisoner)
          </label>
          <textarea
            id={`relay-note-${message.id}`}
            className="reply-notes-textarea"
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
        </>
      )}
      <p style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !changed || text.trim() === ''} onClick={save}>
          {busy ? 'Saving…' : 'Save the changes'}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </p>
      {error && (
        <p className="letter-body-scan-note" role="alert" style={{ color: 'var(--alert)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

export default function QueuedLetterActions({
  message,
  prisonerName,
  prisonId,
  facility,
  blocks,
  onRewrite,
  mayReplaceReply,
  editable,
  onChanged,
}: {
  message: Message
  prisonerName: string
  /** The prisoner's facility now; null when they aren't in the directory (then no group can be chosen). */
  prisonId: number | null
  /** That facility's record with its relay groups: the thread loads it once, for the reply panel and this. */
  facility: ApiState<Prison | null>
  /** Groups not mailing this writer's letters (GET /auth/blocks), left out of the choice. */
  blocks: Map<number, WriterBlock>
  /**
   * For a `reseal_needed` hold, when the letter could be opened and a reply can
   * be sent: put its text in the reply box, once it is deleted.
   */
  onRewrite?: () => void
  /** Before a rewrite deletes the letter: false when the writer would rather keep the reply they are writing. */
  mayReplaceReply?: () => boolean
  /** The letter opened, with typed text: Edit is offered. */
  editable?: EditableLetter
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const held = message.heldReason
  const rewrite = held === 'reseal_needed' && Boolean(onRewrite)

  async function remove() {
    if (rewrite && mayReplaceReply && !mayReplaceReply()) {
      setConfirming(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await deleteLetter(message.id)
      if (rewrite) onRewrite?.()
      onChanged()
    } catch (err) {
      setError(queuedLetterRefusal(toApiError(err), 'delete'))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  if (editing && editable)
    return (
      <EditLetter
        message={message}
        letter={editable}
        groupName={message.relay_group?.name ?? 'the group'}
        onDone={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          onChanged()
        }}
      />
    )

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {held === 'choose_relay' && prisonId !== null && !confirming && (
        <ChooseGroup message={message} facility={facility} blocks={blocks} onChanged={onChanged} />
      )}
      {confirming ? (
        <p className="letter-body-scan-note">
          {deleteQuestion(held, prisonerName, rewrite)}
          {message.attachments?.length && rewrite ? ' Its enclosed file isn’t carried over: add it again.' : ''}{' '}
          <button type="button" className="btn btn-sm" disabled={busy} onClick={remove}>
            {busy ? 'Deleting…' : rewrite ? 'Yes, delete it and write it again' : 'Yes, delete it'}
          </button>{' '}
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </p>
      ) : (
        <p style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {editable && (
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              Edit this letter
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => setConfirming(true)}>
            {rewrite ? 'Delete it and write it again' : 'Delete this letter'}
          </button>
        </p>
      )}
      {error && (
        <p className="letter-body-scan-note" style={{ color: 'var(--alert)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
