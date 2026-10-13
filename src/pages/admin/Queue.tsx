import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { approveSubmission, rejectSubmission } from '../../api/admin'
import { getSubmission, getSubmissions } from '../../api/corrections'
import ListPager from '../../components/ui/ListPager'
import { useApi } from '../../hooks/useApi'
import { usePageClamp } from '../../hooks/useListParams'
import type { AccountBrief, ApiError, Submission, SubmissionResource, SubmissionStatus } from '../../types'
import { commonRefusal, otherRefusal } from '../../utils/refusals'

// The moderation queue: directory proposals from group admins (and superadmins),
// oldest first. A superadmin reads each one against the record's current values,
// then approves (optionally changing a proposed value first, and marking the
// record verified) or rejects with a reason; or approves several plain changes
// at once. GET /moderation/submissions, GET /moderation/submission,
// PUT /moderation/approve (reviewer edits go in `fields`) and PUT /moderation/reject.

const PAGE_SIZE = 20

const STATUSES: (SubmissionStatus | 'all')[] = ['pending', 'approved', 'rejected', 'withdrawn', 'all']
const RESOURCES: SubmissionResource[] = ['prisoner', 'prison', 'chapter']
const RESOURCE_LABELS: Record<SubmissionResource, string> = { prisoner: 'prisoner', prison: 'facility', chapter: 'group' }
const ADMIN_PATHS: Record<SubmissionResource, string> = { prisoner: '/admin/prisoners', prison: '/admin/facilities', chapter: '/admin/groups' }
/** The record's own admin edit page. */
const editPath = (resource: SubmissionResource, id: number) => `${ADMIN_PATHS[resource]}/${id}/edit`
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
  // Timestamps such as verifiedAt, as the rest of the page shows dates.
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? dateTime(value) : value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  // An object as JSON, never "[object Object]".
  return JSON.stringify(value, null, 1) ?? '—'
}

/** "Change to facility #12" or "New prisoner". */
function title(s: Submission) {
  const what = RESOURCE_LABELS[s.resource]
  return s.kind === 'create' ? `New ${what}` : `Change to ${what} #${s.targetId}`
}

/** A refused decision in words (README "PUT /moderation/approve"; refusals.ts for the rest), never the API's sentence. */
function decisionRefusal(error: ApiError): string {
  if (error.name === 'SubmissionChangedError') return 'The group revised this proposal while you were reading it. Close it and review it again.'
  if (error.name === 'SubmissionStateError') return 'Someone else has already decided this proposal. Refresh the queue.'
  return commonRefusal(error) ?? otherRefusal(error)
}

/**
 * Which proposals on the page may be approved together, as proposed: pending
 * changes to an existing record (a new record wants reading whole), and not
 * one whose fields another pending proposal on the page also changes for the
 * same record, since approving both would let the later silently overwrite the
 * earlier. Each id maps to null when it may, or to why not.
 */
function bulkEligibility(items: Submission[]): Map<number, string | null> {
  const out = new Map<number, string | null>()
  const pending = items.filter((s) => s.status === 'pending' && s.kind === 'update' && s.targetId !== null)
  for (const s of pending) {
    const fields = Object.keys(s.payload)
    const clash = pending.some(
      (o) => o.id !== s.id && o.resource === s.resource && o.targetId === s.targetId && Object.keys(o.payload).some((f) => fields.includes(f)),
    )
    out.set(s.id, clash ? 'Another proposal on this page changes the same field of this record: review them one at a time.' : null)
  }
  return out
}

export default function Queue() {
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status')
  const resourceParam = params.get('resource')
  const status = isStatus(statusParam) ? statusParam : 'pending'
  const resource = isResource(resourceParam) ? resourceParam : undefined
  const page = Math.max(1, Number(params.get('page')) || 1)

  const list = useApi(() => getSubmissions({ status, resource, page, page_size: PAGE_SIZE }), [status, resource, page], { keepPrevious: true })

  const setFilter = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next)
  }
  const goToPage = (n: number, replace = false) => {
    const next = new URLSearchParams(params)
    if (n > 1) next.set('page', String(n))
    else next.delete('page')
    setParams(next, { replace })
  }

  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // Deciding the last proposal on a later page goes back a page rather than showing "Nothing is waiting".
  usePageClamp(page, list.data ? pages : null, (n) => goToPage(n, true))

  // Bulk approval: the pending changes on this page that may go through as proposed.
  const items = useMemo(() => list.data?.items ?? [], [list.data])
  const eligibility = useMemo(() => bulkEligibility(items), [items])
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; text: string } | null>(null)
  // Only what is on this page and still eligible counts as selected.
  const chosen = items.filter((s) => selected.has(s.id) && eligibility.get(s.id) === null)
  const selectable = items.filter((s) => eligibility.get(s.id) === null)

  const toggle = (id: number, on: boolean) => {
    setBulkResult(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  /** One request each, oldest first, each with the updatedAt it was read with; stops at the first refusal. */
  async function approveChosen() {
    const n = chosen.length
    if (
      !window.confirm(
        `Approve ${n} proposal${n === 1 ? '' : 's'} exactly as proposed? Each is written to its record straight away. None is marked verified: open one with Review to check it and mark it verified.`,
      )
    )
      return
    setBulkBusy(true)
    setBulkResult(null)
    let done = 0
    let refusal: string | null = null
    for (const s of chosen) {
      try {
        await approveSubmission({ id: s.id, ifUnchangedSince: s.updatedAt })
        done++
      } catch (err) {
        refusal = `${title(s)} (#${s.id}) was refused: ${decisionRefusal(err as ApiError)}`
        break
      }
    }
    const approved = `Approved ${done} of ${n}.`
    setBulkResult(
      refusal
        ? { ok: false, text: `${approved} ${refusal}${n - done > 1 ? ` The ${n - done - 1} after it weren’t sent.` : ''}` }
        : { ok: true, text: `Approved ${n} proposal${n === 1 ? '' : 's'}.` },
    )
    setSelected(new Set())
    setBulkBusy(false)
    list.reload()
  }

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
        {bulkResult && <div className={`admin-alert ${bulkResult.ok ? 'admin-alert-ok' : 'admin-alert-err'}`}>{bulkResult.text}</div>}
        {selectable.length > 1 && (
          <div className="queue-item-actions">
            <label className="queue-check">
              <input
                type="checkbox"
                checked={chosen.length === selectable.length}
                disabled={bulkBusy}
                onChange={(e) => {
                  setBulkResult(null)
                  setSelected(new Set(e.target.checked ? selectable.map((s) => s.id) : []))
                }}
              />
              Select every change on this page that can be approved as proposed ({selectable.length})
            </label>
            <button type="button" className="a-btn a-btn-primary a-btn-sm" disabled={bulkBusy || chosen.length === 0} onClick={() => void approveChosen()}>
              {bulkBusy ? 'Approving…' : `Approve selected (${chosen.length})`}
            </button>
          </div>
        )}
        {items.map((s) => (
          <QueueItem
            key={s.id}
            submission={s}
            onDecided={list.reload}
            bulk={selectable.length > 1 && eligibility.has(s.id) ? { reason: eligibility.get(s.id) ?? null, selected: selected.has(s.id), busy: bulkBusy, onSelect: (on) => toggle(s.id, on) } : null}
          />
        ))}

        {list.data && <ListPager page={page} pages={pages} onPage={(n) => goToPage(n)} />}
      </div>
    </>
  )
}

/** A proposal's place in bulk approval: `reason` is why it can't be included, or null. */
interface BulkChoice {
  reason: string | null
  selected: boolean
  busy: boolean
  onSelect: (on: boolean) => void
}

function QueueItem({ submission: s, onDecided, bulk }: { submission: Submission; onDecided: () => void; bulk: BulkChoice | null }) {
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
                <Link to={editPath(s.resource, s.targetId)} className="queue-view-link">
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

      {bulk &&
        (bulk.reason ? (
          <p className="form-hint">{bulk.reason}</p>
        ) : (
          <label className="queue-check">
            <input type="checkbox" checked={bulk.selected} disabled={bulk.busy} onChange={(e) => bulk.onSelect(e.target.checked)} />
            Include in “Approve selected”
          </label>
        ))}

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

/**
 * How a proposed value is edited before approving, by the shape it was
 * proposed in: text, a list of text (one per line), a number, yes or no, or
 * anything else (an address object) as JSON.
 */
type ValueKind = 'text' | 'lines' | 'number' | 'boolean' | 'json'

function kindOf(value: unknown): ValueKind {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return 'lines'
  if (value === null || value === undefined || typeof value === 'string') return 'text'
  return 'json'
}

function toEditable(value: unknown, kind: ValueKind): string | boolean {
  switch (kind) {
    case 'boolean':
      return value === true
    case 'number':
      return String(value)
    case 'lines':
      return (value as string[]).join('\n')
    case 'text':
      return typeof value === 'string' ? value : ''
    case 'json':
      return JSON.stringify(value, null, 2)
  }
}

/** The edited value as the API takes it, or an Error saying what is wrong with it. */
function fromEditable(edited: string | boolean, kind: ValueKind, field: string): unknown {
  if (typeof edited === 'boolean') return edited
  switch (kind) {
    case 'number': {
      if (!edited.trim()) return null
      const n = Number(edited)
      return Number.isFinite(n) ? n : new Error(`${fieldLabel(field)} must be a number.`)
    }
    case 'lines':
      return edited
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    case 'json':
      try {
        return JSON.parse(edited) as unknown
      } catch {
        return new Error(`${fieldLabel(field)} isn’t valid JSON: check the brackets, quotes and commas.`)
      }
    default:
      return edited.trim() || null
  }
}

function DecisionForm({ submission: s, onCancel, onDecided }: { submission: Submission; onCancel: () => void; onDecided: () => void }) {
  const verifiable = VERIFIABLE.includes(s.resource)
  const [note, setNote] = useState('')
  const [markVerified, setMarkVerified] = useState(verifiable)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Edit then approve: each proposed field's value as the admin has it now.
  const proposed = useMemo(
    () => Object.entries(s.payload).map(([field, value]) => ({ field, kind: kindOf(value), initial: toEditable(value, kindOf(value)) })),
    [s.payload],
  )
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(proposed.map((p) => [p.field, p.initial])))
  const edited = proposed.filter((p) => values[p.field] !== p.initial)

  /** The reviewer's changes to send as `fields`, or an error to show. */
  function reviewerEdits(): Record<string, unknown> | string {
    const out: Record<string, unknown> = {}
    for (const p of edited) {
      const value = fromEditable(values[p.field], p.kind, p.field)
      if (value instanceof Error) return value.message
      out[p.field] = value
    }
    return out
  }

  async function decide(action: 'approve' | 'reject') {
    if (action === 'reject' && !note.trim()) {
      setError('Say why it is rejected: the group that proposed it is told.')
      return
    }
    const edits = action === 'approve' ? reviewerEdits() : {}
    if (typeof edits === 'string') {
      setError(edits)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (action === 'approve') {
        const fields = {
          // Reviewer edits are merged over the proposal (README "PUT /moderation/approve").
          ...edits,
          // Approving is also checking: the record is marked verified now. verifiedBy names
          // the *group* that verified (a Chapters id), and a superadmin has none, so it is
          // cleared rather than left crediting whichever group checked it last.
          ...(verifiable && markVerified ? { verifiedAt: new Date().toISOString(), verifiedBy: null } : {}),
        }
        await approveSubmission({
          id: s.id,
          ...(Object.keys(fields).length > 0 ? { fields } : {}),
          ...(note.trim() ? { decisionNote: note.trim() } : {}),
          ifUnchangedSince: s.updatedAt,
        })
      } else {
        await rejectSubmission(s.id, note.trim())
      }
      onDecided()
    } catch (err) {
      setError(decisionRefusal(err as ApiError))
      setBusy(false)
    }
  }

  return (
    <div className="queue-decision-form">
      {proposed.length > 0 && !editing && (
        <div>
          <button type="button" className="a-btn a-btn-sm" disabled={busy} onClick={() => setEditing(true)}>
            Change a value before approving
          </button>
        </div>
      )}
      {editing && (
        <fieldset className="queue-decision-form" style={{ border: 'none' }}>
          <legend className="form-label">Approve with these values</legend>
          <span className="form-hint">
            What is written to the record if you approve. The group sees what was written. Lists take one item per line
            {proposed.some((p) => p.kind === 'json') ? '; the rest is JSON, as proposed' : ''}.
          </span>
          {proposed.map((p) => {
            const id = `edit-${s.id}-${p.field}`
            const value = values[p.field]
            const set = (v: string | boolean) => setValues((prev) => ({ ...prev, [p.field]: v }))
            const changedNow = value !== p.initial
            if (typeof value === 'boolean')
              return (
                <label key={p.field} className="queue-check">
                  <input type="checkbox" checked={value} disabled={busy} onChange={(e) => set(e.target.checked)} />
                  {fieldLabel(p.field)}
                  {changedNow && <span className="form-hint"> (changed)</span>}
                </label>
              )
            const multiline = p.kind === 'lines' || p.kind === 'json' || value.includes('\n') || value.length > 80
            return (
              <div key={p.field} className="form-group">
                <label className="form-label" htmlFor={id}>
                  {fieldLabel(p.field)}
                  {changedNow && <span className="form-hint"> (changed)</span>}
                </label>
                {multiline ? (
                  <textarea
                    id={id}
                    className="form-textarea short"
                    rows={Math.min(8, Math.max(2, value.split('\n').length))}
                    value={value}
                    disabled={busy}
                    onChange={(e) => set(e.target.value)}
                  />
                ) : (
                  <input
                    id={id}
                    className="form-input"
                    inputMode={p.kind === 'number' ? 'numeric' : undefined}
                    value={value}
                    disabled={busy}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
              </div>
            )
          })}
          <div>
            <button
              type="button"
              className="a-btn a-btn-sm"
              disabled={busy}
              onClick={() => {
                setValues(Object.fromEntries(proposed.map((p) => [p.field, p.initial])))
                setEditing(false)
              }}
            >
              Use the values as proposed
            </button>
          </div>
        </fieldset>
      )}
      <label className="form-label" htmlFor={`note-${s.id}`}>
        Note to the group <span className="form-hint">(required to reject{edited.length > 0 ? '; worth saying what you changed' : ''})</span>
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
          {edited.length > 0 ? `Approve with ${edited.length} change${edited.length === 1 ? '' : 's'}` : 'Approve'}
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
