import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { approveSubmission, rejectSubmission } from '../../api/admin'
import { getSubmission, getSubmissions } from '../../api/corrections'
import { useApi } from '../../hooks/useApi'
import type { AccountBrief, Submission, SubmissionResource, SubmissionStatus } from '../../types'

// The moderation queue: directory proposals from group admins (and superadmins),
// oldest first. A superadmin reads each one against the record's current values,
// then approves (optionally marking the record verified) or rejects with a reason.
// GET /moderation/submissions, GET /moderation/submission, PUT /moderation/approve
// and PUT /moderation/reject.

const PAGE_SIZE = 20

const STATUSES: (SubmissionStatus | 'all')[] = ['pending', 'approved', 'rejected', 'withdrawn', 'all']
const RESOURCES: SubmissionResource[] = ['prisoner', 'prison', 'chapter']
const RESOURCE_LABELS: Record<SubmissionResource, string> = { prisoner: 'prisoner', prison: 'facility', chapter: 'group' }
const PUBLIC_PATHS: Record<SubmissionResource, string> = { prisoner: '/prisoners', prison: '/facilities', chapter: '/groups' }
/** Only prisoners and facilities carry verifiedBy / verifiedAt. */
const VERIFIABLE: SubmissionResource[] = ['prisoner', 'prison']

const isStatus = (v: string | null): v is SubmissionStatus | 'all' => STATUSES.includes(v as SubmissionStatus)
const isResource = (v: string | null): v is SubmissionResource => RESOURCES.includes(v as SubmissionResource)

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

const who = (account: AccountBrief | null | undefined) => (account ? account.name || account.username : 'someone no longer here')

/** "mailRules" → "Mail rules". */
const fieldLabel = (field: string) => {
  const words = field.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(', ') : '—'
  if (typeof value === 'object') return JSON.stringify(value, null, 1)
  // Timestamps such as verifiedAt, as the rest of the page shows dates.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return dateTime(value)
  return String(value)
}

/** "Change to facility #12" or "New prisoner". */
function title(s: Submission) {
  const what = RESOURCE_LABELS[s.resource]
  return s.kind === 'create' ? `New ${what}` : `Change to ${what} #${s.targetId}`
}

export default function Queue() {
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status')
  const resourceParam = params.get('resource')
  const status = isStatus(statusParam) ? statusParam : 'pending'
  const resource = isResource(resourceParam) ? resourceParam : undefined
  const page = Math.max(1, Number(params.get('page')) || 1)

  const list = useApi(() => getSubmissions({ status, resource, page, page_size: PAGE_SIZE }), [status, resource, page])

  const setFilter = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next)
  }
  const goToPage = (n: number) => {
    const next = new URLSearchParams(params)
    if (n > 1) next.set('page', String(n))
    else next.delete('page')
    setParams(next)
  }

  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Moderation queue</span>
        <span className="topbar-right">
          {list.data && `${total} ${status === 'all' ? 'in total' : status}`}
        </span>
      </div>

      <div className="admin-content">
        <div className="queue-filters">
          <label className="form-label">
            Status
            <select className="form-select" value={status} onChange={(e) => setFilter('status', e.target.value === 'pending' ? undefined : e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Record
            <select className="form-select" value={resource ?? ''} onChange={(e) => setFilter('resource', e.target.value || undefined)}>
              <option value="">All</option>
              {RESOURCES.map((r) => (
                <option key={r} value={r}>
                  {RESOURCE_LABELS[r].charAt(0).toUpperCase() + RESOURCE_LABELS[r].slice(1)}s
                </option>
              ))}
            </select>
          </label>
        </div>

        {list.loading && <p className="dash-note">Loading the queue…</p>}
        {list.error && (
          <div className="admin-alert admin-alert-err">
            Couldn't load the queue ({list.error.message}).
            <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
              Try again
            </button>
          </div>
        )}
        {list.data && list.data.items.length === 0 && (
          <p className="dash-note">{status === 'pending' ? 'Nothing is waiting for review.' : 'No proposals match these filters.'}</p>
        )}
        {list.data?.items.map((s) => (
          <QueueItem key={s.id} submission={s} onDecided={list.reload} />
        ))}

        {pages > 1 && (
          <div className="queue-pager">
            <button type="button" className="a-btn a-btn-sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              ← Older
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button type="button" className="a-btn a-btn-sm" disabled={page >= pages} onClick={() => goToPage(page + 1)}>
              Newer →
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function QueueItem({ submission: s, onDecided }: { submission: Submission; onDecided: () => void }) {
  const [open, setOpen] = useState(false)
  const pending = s.status === 'pending'

  return (
    <article className={`queue-item${s.kind === 'create' ? ' queue-new' : ''}${pending ? '' : ' queue-decided'}`}>
      <div className="queue-item-header">
        <div>
          <div className="queue-item-title">
            {title(s)}
            {s.kind === 'update' && s.targetId !== null && (
              <>
                {' '}
                <Link to={`${PUBLIC_PATHS[s.resource]}/${s.targetId}`} className="queue-view-link">
                  view record
                </Link>
              </>
            )}
          </div>
          <div className="queue-item-meta">
            #{s.id} · from {who(s.submitter)} · {dateTime(s.createdAt)}
          </div>
        </div>
        <StatusBadge status={s.status} />
      </div>

      {(s.note || s.evidence) && (
        <div className="queue-item-body">
          {s.note && (
            <p>
              <strong>Note:</strong> {s.note}
            </p>
          )}
          {s.evidence && (
            <p>
              <strong>Evidence:</strong> {s.evidence}
            </p>
          )}
        </div>
      )}

      {!pending && <Decision submission={s} />}

      {open ? (
        <Review submission={s} onClose={() => setOpen(false)} onDecided={onDecided} />
      ) : (
        <div className="queue-item-actions">
          <button type="button" className={`a-btn a-btn-sm${pending ? ' a-btn-primary' : ''}`} onClick={() => setOpen(true)}>
            {pending ? 'Review' : 'Show changes'}
          </button>
        </div>
      )}
    </article>
  )
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const style = status === 'approved' ? 'badge-published' : status === 'pending' ? 'badge-draft' : 'badge-pending'
  return <span className={`badge ${style}`}>{status}</span>
}

/** Who decided, when, and why. */
function Decision({ submission: s }: { submission: Submission }) {
  if (s.status === 'withdrawn') return <p className="queue-decision">Withdrawn by the submitter.</p>
  return (
    <p className="queue-decision">
      {s.status === 'approved' ? 'Approved' : 'Rejected'} by {who(s.reviewer)}
      {s.reviewedAt && <> on {dateTime(s.reviewedAt)}</>}
      {s.decisionNote && <>: “{s.decisionNote}”</>}
    </p>
  )
}

/** The proposal against the record's current values, and (while pending) the decision form. */
function Review({ submission: s, onClose, onDecided }: { submission: Submission; onClose: () => void; onDecided: () => void }) {
  const detail = useApi(() => getSubmission(s.id), [s.id])
  const pending = s.status === 'pending'

  return (
    <div className="queue-review">
      {detail.loading && <p className="dash-note">Loading the current values…</p>}
      {detail.error && (
        <div className="admin-alert admin-alert-err">
          Couldn't load this proposal ({detail.error.message}).
          <button type="button" className="a-btn a-btn-sm" onClick={detail.reload}>
            Try again
          </button>
        </div>
      )}
      {detail.data && <Changes submission={detail.data} />}
      {detail.data && pending ? (
        <DecisionForm submission={detail.data} onCancel={onClose} onDecided={onDecided} />
      ) : (
        <div className="queue-item-actions">
          <button type="button" className="a-btn a-btn-sm" onClick={onClose}>
            Hide
          </button>
        </div>
      )}
    </div>
  )
}

/** Field by field: current value and proposed value. For an approved one, what was actually written. */
function Changes({ submission: s }: { submission: Submission }) {
  const approved = s.status === 'approved' && s.appliedChanges !== null
  const proposed = approved && s.appliedChanges ? s.appliedChanges : s.payload
  const fields = Object.keys(proposed)
  // Once approved, the record's present values already include the change, so
  // a before/after would compare the change with itself: show what was written.
  const isUpdate = s.kind === 'update' && !approved
  const current = s.current ?? null

  if (fields.length === 0) return <p className="dash-note">This proposal changes no fields.</p>
  if (isUpdate && current === null && s.status === 'pending')
    return (
      <div className="admin-alert admin-alert-warn">
        The record this proposal changes no longer exists. Approving it will fail; reject it instead.
      </div>
    )

  return (
    <div className="admin-table-wrap queue-changes">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Field</th>
            {isUpdate && <th>Current</th>}
            <th>{approved ? 'Written' : 'Proposed'}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const before = current ? formatValue(current[field]) : null
            const after = formatValue(proposed[field])
            const changed = before !== after
            return (
              <tr key={field}>
                <td>{fieldLabel(field)}</td>
                {isUpdate && <td className={changed ? 'diff-del' : undefined}>{before ?? '—'}</td>}
                <td className={changed && isUpdate ? 'diff-add' : undefined}>{after}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DecisionForm({ submission: s, onCancel, onDecided }: { submission: Submission; onCancel: () => void; onDecided: () => void }) {
  const verifiable = VERIFIABLE.includes(s.resource)
  const [note, setNote] = useState('')
  const [markVerified, setMarkVerified] = useState(verifiable)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function decide(action: 'approve' | 'reject') {
    if (action === 'reject' && !note.trim()) {
      setError('Say why it is rejected: the group that proposed it is told.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (action === 'approve') {
        await approveSubmission({
          id: s.id,
          // Approving is also checking: the record is marked verified now. verifiedBy names
          // the *group* that verified (a Chapters id), and a superadmin has none, so it is
          // cleared rather than left crediting whichever group checked it last.
          ...(verifiable && markVerified ? { fields: { verifiedAt: new Date().toISOString(), verifiedBy: null } } : {}),
          ...(note.trim() ? { decisionNote: note.trim() } : {}),
          ifUnchangedSince: s.updatedAt,
        })
      } else {
        await rejectSubmission(s.id, note.trim())
      }
      onDecided()
    } catch (err) {
      const e = err as { status?: number; name?: string | null; message?: string; errors?: string[] }
      if (e.name === 'SubmissionChangedError') setError('The group revised this proposal while you were reading it. Close it and review it again.')
      else if (e.name === 'SubmissionStateError') setError('Someone else has already decided this proposal. Refresh the queue.')
      else setError(e.errors?.length ? e.errors.join(' ') : (e.message ?? 'The decision could not be saved.'))
      setBusy(false)
    }
  }

  return (
    <div className="queue-decision-form">
      <label className="form-label" htmlFor={`note-${s.id}`}>
        Note to the group <span className="form-hint">(required to reject)</span>
      </label>
      <textarea id={`note-${s.id}`} className="form-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
      {verifiable && (
        <label className="queue-check">
          <input type="checkbox" checked={markVerified} onChange={(e) => setMarkVerified(e.target.checked)} disabled={busy} />
          Mark the record verified on approval
        </label>
      )}
      {error && <div className="admin-alert admin-alert-err">{error}</div>}
      <div className="queue-item-actions">
        <button type="button" className="a-btn a-btn-primary a-btn-sm" disabled={busy} onClick={() => decide('approve')}>
          Approve
        </button>
        <button type="button" className="a-btn a-btn-danger a-btn-sm" disabled={busy} onClick={() => decide('reject')}>
          Reject
        </button>
        <button type="button" className="a-btn a-btn-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
