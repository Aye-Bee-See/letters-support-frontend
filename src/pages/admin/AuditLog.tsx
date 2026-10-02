import { Link } from 'react-router-dom'
import { getAuditLog } from '../../api/admin'
import ListPager from '../../components/ui/ListPager'
import { useApi } from '../../hooks/useApi'
import { useListParams } from '../../hooks/useListParams'
import type { AccountBrief, AuditEntry } from '../../types'

// The audit log (GET /moderation/audit, superadmins only), newest first. The
// API filters on exact values (actor, action, resource, target), and records
// over fifty kinds of action, so rather than a long menu, each row's actor,
// action and record are links that narrow the log to them. Filters live in the
// URL under the API's names.

const PAGE_SIZE = 50

/** The kinds of record entries are about, as the API names them: [plural for the menu, singular for a row]. */
const RESOURCES: Record<string, [string, string]> = {
  prisoner: ['Prisoners', 'prisoner'],
  prison: ['Facilities', 'facility'],
  chapter: ['Groups', 'group'],
  submission: ['Proposals', 'proposal'],
  message: ['Letters', 'letter'],
  user: ['Accounts', 'account'],
  invitation: ['Invitations', 'invitation'],
  'mail-rule': ['Mail rules', 'mail rule'],
  site: ['Site settings', 'site setting'],
}

/** Where an admin can open the record an entry is about, when there's a page for it. */
function recordLink(resource: string, id: number): string | null {
  switch (resource) {
    case 'prisoner':
      return `/admin/prisoners/${id}/edit`
    case 'prison':
      return `/admin/facilities/${id}/edit`
    case 'chapter':
      return `/admin/groups/${id}/edit`
    case 'submission':
      return '/admin/queue?status=all'
    default:
      return null
  }
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })

const who = (a: AccountBrief | null) => (a ? a.name || a.username : null)

/** "verifiedAt" → "Verified at". */
const label = (key: string) => {
  const words = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.map(show).join(', ') : '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return dateTime(value)
  return String(value)
}

const isFromTo = (v: unknown): v is { from: unknown; to: unknown } =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'from' in v && 'to' in v

export default function AuditLog() {
  const { params, page, update, clear } = useListParams()
  const actor = Number(params.get('actor')) || undefined
  const action = params.get('action') || undefined
  const resource = params.get('resource') || undefined
  const target = Number(params.get('target')) || undefined

  const list = useApi(
    () => getAuditLog({ actor, action, resource, target, page, page_size: PAGE_SIZE }),
    [actor, action, resource, target, page],
  )
  const filtered = Boolean(actor || action || resource || target)
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // The actor's name, for the filter chip, from any row that has it.
  const actorName = actor ? (who(list.data?.items.find((e) => e.actor === actor)?.actor_details ?? null) ?? `account #${actor}`) : null

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Audit log</span>
        <span className="topbar-right">{list.data && `${total.toLocaleString()} ${filtered ? 'matching' : 'entries'}`}</span>
      </div>

      <div className="admin-content">
        <div className="admin-table-toolbar list-toolbar">
          <select className="form-select" aria-label="Record type" value={resource ?? ''} onChange={(e) => update({ resource: e.target.value || undefined, target: undefined })}>
            <option value="">Every kind of record</option>
            {resource && !RESOURCES[resource] && <option value={resource}>{resource}</option>}
            {Object.entries(RESOURCES).map(([value, [text]]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          {/* The narrowing that came from clicking a row, each removable. */}
          {actorName && <FilterChip text={`By ${actorName}`} onRemove={() => update({ actor: undefined })} />}
          {action && <FilterChip text={action} mono onRemove={() => update({ action: undefined })} />}
          {target && <FilterChip text={`${(resource && RESOURCES[resource]?.[1]) ?? 'record'} #${target}`} onRemove={() => update({ target: undefined })} />}
          {filtered && (
            <button type="button" className="a-btn a-btn-sm" onClick={() => clear()}>
              Clear filters
            </button>
          )}
          {!filtered && <span className="form-hint">Click a person, action or record in the log to see only those.</span>}
        </div>

        <div className="admin-table-wrap">
          {list.loading && <p className="dash-note">Loading the audit log…</p>}
          {list.error && (
            <p className="dash-note">
              Couldn't load the audit log ({list.error.message}).{' '}
              <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
                Try again
              </button>
            </p>
          )}
          {list.data && list.data.total === 0 && <p className="dash-note">{filtered ? 'No entries match these filters.' : 'Nothing has been recorded yet.'}</p>}
          {list.data && list.data.items.length > 0 && (
            <table className="admin-table audit-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Record</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((e) => (
                  <AuditRow key={e.id} entry={e} onFilter={update} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {list.data && <ListPager page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />}
      </div>
    </>
  )
}

function FilterChip({ text, mono, onRemove }: { text: string; mono?: boolean; onRemove: () => void }) {
  return (
    <span className="audit-chip">
      <span className={mono ? 'dash-code' : undefined}>{text}</span>
      <button type="button" aria-label={`Remove filter: ${text}`} onClick={onRemove}>
        ×
      </button>
    </span>
  )
}

function AuditRow({ entry: e, onFilter }: { entry: AuditEntry; onFilter: (changes: Record<string, string | undefined>) => void }) {
  const actorName = who(e.actor_details)
  const open = e.targetId !== null ? recordLink(e.resource, e.targetId) : null
  return (
    <tr>
      <td className="dash-nowrap">{dateTime(e.createdAt)}</td>
      <td>
        {e.actor !== null ? (
          <button type="button" className="link-button" title="Only this person's actions" onClick={() => onFilter({ actor: String(e.actor) })}>
            {actorName ?? `Account #${e.actor}`}
          </button>
        ) : (
          <span className="list-sub">{e.action.startsWith('writer.claim') ? 'The writer (claiming)' : 'The system'}</span>
        )}
        {e.actor_details?.role && <div className="list-sub">{e.actor_details.role === 'admin' ? 'superadmin' : e.actor_details.role === 'chapter' ? 'group admin' : 'writer'}</div>}
      </td>
      <td>
        <button type="button" className="link-button dash-code" title="Only this action" onClick={() => onFilter({ action: e.action })}>
          {e.action}
        </button>
      </td>
      <td className="dash-nowrap">
        {e.targetId !== null ? (
          <>
            <button
              type="button"
              className="link-button"
              title="Only entries about this record"
              onClick={() => onFilter({ resource: e.resource, target: String(e.targetId) })}
            >
              {RESOURCES[e.resource]?.[1] ?? e.resource} #{e.targetId}
            </button>
            {open && (
              <>
                {' '}
                <Link to={open} className="list-sub">
                  open
                </Link>
              </>
            )}
          </>
        ) : (
          <span className="list-sub">{e.resource}</span>
        )}
      </td>
      <td>
        <Details details={e.details} />
      </td>
    </tr>
  )
}

/**
 * The entry's details, readably. `changes` is either { field: { from, to } }
 * (an edit) or { field: value } (what an approved proposal wrote); anything
 * else is listed as it is.
 */
function Details({ details }: { details: Record<string, unknown> | null }) {
  if (!details || Object.keys(details).length === 0) return <span className="list-sub">—</span>
  const { changes, fields, ...rest } = details
  return (
    <dl className="audit-details">
      {changes && typeof changes === 'object'
        ? Object.entries(changes as Record<string, unknown>).map(([key, value]) => (
            <div key={`c-${key}`}>
              <dt>{label(key)}</dt>
              <dd>
                {isFromTo(value) ? (
                  <>
                    <span className="diff-del">{show(value.from)}</span> → <span className="diff-add">{show(value.to)}</span>
                  </>
                ) : (
                  show(value)
                )}
              </dd>
            </div>
          ))
        : null}
      {fields !== undefined && (
        <div>
          <dt>{Array.isArray(fields) ? 'Fields' : 'Values'}</dt>
          <dd>{show(fields)}</dd>
        </div>
      )}
      {Object.entries(rest).map(([key, value]) =>
        // The API calls groups "chapters"; relay and support entries name one by id.
        key === 'chapter' && typeof value === 'number' ? (
          <div key="r-chapter">
            <dt>Group</dt>
            <dd>
              <Link to={`/admin/groups/${value}/edit`}>group #{value}</Link>
            </dd>
          </div>
        ) : (
          <div key={`r-${key}`}>
            <dt>{label(key)}</dt>
            <dd>{show(value)}</dd>
          </div>
        ),
      )}
    </dl>
  )
}
