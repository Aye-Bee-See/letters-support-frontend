import { useState } from 'react'
import { getFacility } from '../../api/facilities'
import { useApi } from '../../hooks/useApi'
import { useLetterDraft } from '../../hooks/useLetterDraft'
import type { Message } from '../../types'
import { mailRuleLines } from '../../utils/facilities'
import UploadZone from './UploadZone'

// The inline reply panel from solidarity-site/thread.html (pages/thread.css):
// the same draft and send as New Letter (useLetterDraft, src/letters/send.ts),
// with the prisoner fixed and the group that mailed the last letter preferred.
export default function ReplyPanel({
  prisonerId,
  prisonId,
  preferredGroup,
  resend,
  onCancelResend,
  onSent,
}: {
  prisonerId: number
  prisonId: number
  preferredGroup?: number
  /** Writing a returned or declined letter again (the panel is keyed on it, so this is read once). */
  resend?: { id: number; date: string; text: string }
  onCancelResend?: () => void
  onSent: (message: Message) => void
}) {
  const facility = useApi(() => getFacility(prisonId, true), [prisonId])
  const draft = useLetterDraft(prisonerId, facility.data ?? null, preferredGroup, resend ? { text: resend.text, resendOf: resend.id } : undefined)
  const [notesOpen, setNotesOpen] = useState(false)
  const rules = facility.data ? mailRuleLines(facility.data) : []
  const group = draft.groups.find((g) => g.id === draft.relayChapterId) ?? null

  async function onSend() {
    const message = await draft.send()
    if (message) onSent(message)
  }

  if (facility.data && (draft.groups.length === 0 || draft.allBlocked)) {
    return (
      <div className="reply-panel">
        <div className="reply-panel-body">
          <p className="reply-notes-hint">
            {draft.allBlocked
              ? `No group that mails to ${facility.data.prisonName} is taking your letters right now, so a reply can't be sent through this site.`
              : `No group mails to ${facility.data.prisonName} any more, so a reply can't be sent through this site right now.`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="reply-panel">
      <div className="reply-panel-header">
        <div className="reply-facility-rules">
          <span className="reply-facility-rules-heading">Facility rules — {facility.data?.prisonName ?? '…'}</span>
          {rules.length > 0 ? (
            <ul className="reply-facility-list">
              {rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            facility.data && <p className="reply-notes-hint">No mail rules on record.</p>
          )}
        </div>
        <UploadZone variant="reply" file={draft.file} onFile={draft.setFile} label={draft.paper ? 'Add a photo (optional)' : 'Upload scan instead'} />
      </div>

      <div className={notesOpen ? 'reply-notes-area is-open' : 'reply-notes-area'}>
        <textarea
          className="reply-notes-textarea"
          placeholder={`Optional note to ${group?.name ?? 'the group'}: not sent to the prisoner.`}
          value={draft.relayNote}
          onChange={(e) => draft.setRelayNote(e.target.value)}
        />
        <p className="reply-notes-hint">Only the group that mails your letter sees this.</p>
      </div>

      <div className="reply-panel-body">
        {/* Writing a returned or declined letter again: it goes out as a new letter, marked as replacing that one. */}
        {draft.resendOf && resend && (
          <p className="reply-notes-hint reply-resend">
            Writing again your letter of {new Date(resend.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Change
            anything you need to; it goes out as a new letter.{' '}
            {onCancelResend && (
              <button type="button" className="reply-notes-toggle" onClick={onCancelResend}>
                Cancel
              </button>
            )}
          </p>
        )}
        {draft.paper ? (
          <p className="reply-notes-hint">Nothing to type: you are handing this letter to {group?.name ?? 'the group'} on paper.</p>
        ) : (
          <>
            <textarea
              className="reply-textarea"
              placeholder="Write your reply here. Paragraph breaks will be preserved when printed."
              value={draft.text}
              onChange={(e) => draft.setText(e.target.value)}
            />
            <div className="reply-meta-bar">
              <span>{draft.text.length.toLocaleString()} characters</span>
              <span style={draft.overPageLimit ? { color: 'var(--alert)' } : undefined}>
                ~{draft.pages} {draft.pages === 1 ? 'page' : 'pages'}
                {facility.data?.pageLimit ? ` (limit ${facility.data.pageLimit})` : ''}
              </span>
            </div>
          </>
        )}
        <div className="claim-check-row" style={{ marginTop: '0.5rem' }}>
          <input type="checkbox" id="replyOnPaper" checked={draft.paper} onChange={(e) => draft.setPaper(e.target.checked)} />
          <label className="claim-check-label" htmlFor="replyOnPaper">
            I'm handing this letter to the group on paper
          </label>
        </div>
        {draft.error && (
          <p className="reply-notes-hint" style={{ color: 'var(--alert)' }}>
            <strong>Not sent.</strong> {draft.error}
          </p>
        )}
      </div>

      <div className="reply-panel-footer">
        <button type="button" className="reply-notes-toggle" onClick={() => setNotesOpen((o) => !o)}>
          {notesOpen ? '− Hide the note' : `+ Add a note to ${group?.name ?? 'the group'}`}
        </button>
        <span className="reply-submit-note">
          {draft.groups.length > 1 ? (
            <>
              <strong>Goes to the queue of</strong>{' '}
              <select
                value={draft.relayChapterId ?? ''}
                onChange={(e) => draft.setChosenGroup(Number(e.target.value))}
                aria-label="Group that mails this letter"
              >
                {draft.groups.map((g) => (
                  <option key={g.id} value={g.id} disabled={draft.blocked.has(g.id)}>
                    {g.name}
                    {draft.blocked.has(g.id) ? ' (not mailing your letters)' : ''}
                  </option>
                ))}
              </select>
              , who will print and mail it.
            </>
          ) : (
            <>
              <strong>Goes to the queue.</strong> {group?.name ?? 'The group'} will print and mail it.
            </>
          )}
        </span>
        <button type="button" className="reply-submit-btn" disabled={!draft.canSend} onClick={onSend}>
          {draft.sending ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </div>
  )
}
