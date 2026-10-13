import { getFacilityHistory } from '../../api/facilities'
import { getGroupHistory } from '../../api/groups'
import { getPrisonerHistory } from '../../api/prisoners'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { HistoryEntry, SubmissionResource } from '../../types'
import { actorName, HISTORY_ACTIONS } from '../../utils/history'
import { commonRefusal, otherRefusal } from '../../utils/refusals'
import { Section } from '../forms/AdminFormParts'

// What happened to one directory record (README "The history of one record"):
// GET /prisoner/history, /prison/history or /chapter/history, newest first,
// staff only. The first page, each entry with who, what, when, and its field
// changes as from → to. Entries are routine audit entries, kept 180 days by
// default (README "Retention"). Shared by the three admin edit pages. A group
// admin's own settings page (pages/org/OrgSettings.tsx) has its own shorter
// list, of the same entries: HistoryItem with variant "group".

const PAGE_SIZE = 20

const LOADERS = { prisoner: getPrisonerHistory, prison: getFacilityHistory, chapter: getGroupHistory } as const

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "mailRules" → "Mail rules". */
const fieldLabel = (field: string) => {
  const words = field.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(', ') : '—'
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? when(value) : value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  // An object (an address) as JSON, never "[object Object]".
  return JSON.stringify(value) ?? '—'
}

export default function RecordHistory({ resource, id, version }: { resource: SubmissionResource; id: number; version?: string }) {
  // `version` (the record's updatedAt) asks again after the page saves the record.
  const history = useApi(() => LOADERS[resource](id, { page: 1, page_size: PAGE_SIZE }), [resource, id, version ?? null], { keepPrevious: true })

  return (
    <div className="admin-form relay-panel">
      <Section title="History">
        {history.loading && <p className="form-static">Loading the history…</p>}
        {history.error && (
          <div className="admin-alert admin-alert-err" role="alert">
            {history.error.status === 404
              ? 'There is no history for this record.'
              : `Couldn’t load the history: ${commonRefusal(history.error) ?? otherRefusal(history.error)}`}{' '}
            {history.error.status !== 404 && (
              <button type="button" className="a-btn a-btn-sm" onClick={history.reload}>
                Try again
              </button>
            )}
          </div>
        )}
        {history.data && history.data.items.length === 0 && <p className="form-static">Nothing recorded in the last 180 days.</p>}
        {history.data && history.data.items.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table audit-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                </tr>
              </thead>
              <tbody>
                {history.data.items.map((entry) => (
                  <HistoryItem key={entry.id} entry={entry} variant="admin" />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="form-hint">
          {history.data && history.data.total > history.data.items.length
            ? `The latest ${history.data.items.length} of ${history.data.total} entries. `
            : ''}
          Entries are kept for 180 days, so this isn’t the record’s whole life.{' '}
          <button type="button" className="link-button" onClick={history.reload} disabled={history.reloading}>
            {history.reloading ? 'Refreshing…' : 'Refresh'}
          </button>
        </p>
      </Section>
    </div>
  )
}

/**
 * One entry, with who and when. Variant "admin": a row of the admin pages'
 * table, the field changes as from → to. Variant "group": a line of the group
 * settings page's list (pages/org-settings.css), the changed fields named.
 */
export function HistoryItem({ entry, variant }: { entry: HistoryEntry; variant: 'admin' | 'group' }) {
  const { user } = useAuth()
  const who = actorName(entry.actor, user?.id)
  if (variant === 'group') return <GroupLine entry={entry} who={who} />
  return (
    <tr>
      <td className="dash-nowrap">{when(entry.at)}</td>
      <td>{capitalise(who)}</td>
      <td>
        <HistoryWhat entry={entry} />
      </td>
    </tr>
  )
}

/** The action in words, its field changes as from → to, and anything else it recorded. */
function HistoryWhat({ entry }: { entry: HistoryEntry }) {
  const changes = Object.entries(entry.changes ?? {})
  // `replaced` on a photo entry is the old file's name on disk: said, not shown.
  const { viaSubmission, replaced, ...details } = entry.details ?? {}
  const otherDetails = Object.entries(details)
  const isEdit = entry.action.endsWith('.update')
  return (
    <>
      <div>
        <strong>{HISTORY_ACTIONS[entry.action] ?? entry.action}</strong>
        {typeof viaSubmission === 'number' && <span className="list-sub"> · from proposal #{viaSubmission}</span>}
        {isEdit && changes.length === 0 && <span className="list-sub"> · saved with nothing changed</span>}
        {Boolean(replaced) && <span className="list-sub"> · replaced an earlier photo</span>}
      </div>
      {(changes.length > 0 || otherDetails.length > 0) && (
        <dl className="audit-details">
          {changes.map(([field, change]) => (
            <div key={field}>
              <dt>{fieldLabel(field)}</dt>
              <dd>
                <span className="diff-del">{formatValue(change.from)}</span> → <span className="diff-add">{formatValue(change.to)}</span>
              </dd>
            </div>
          ))}
          {otherDetails.map(([key, value]) => (
            <div key={key}>
              <dt>{fieldLabel(key)}</dt>
              <dd>{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}

/** A group record's field names as its settings form says them. */
const FIELD_NAMES: Record<string, string> = {
  name: 'name',
  location: 'address',
  subregion: 'area',
  country: 'country',
  about: 'about',
  website: 'website',
  email: 'public email',
  socialLinks: 'social links',
  services: 'services',
  announcement: 'announcement',
  networkRole: 'network role',
  accountStatus: 'account status',
  vouchedBy: 'vouched for by',
  lettersSentBefore: 'letters sent before joining',
  recordStatus: 'record status',
}

/** The group settings page's line: when and who, then the action, with a count or the fields an edit changed. */
function GroupLine({ entry, who }: { entry: HistoryEntry; who: string }) {
  const fields = Object.keys(entry.changes ?? {}).map((f) => FIELD_NAMES[f] ?? f)
  const count = typeof entry.details?.count === 'number' ? entry.details.count : typeof entry.details?.cancelled === 'number' ? entry.details.cancelled : null
  return (
    <li>
      <div className="settings-history-when">
        {when(entry.at)}
        {/* Nobody is named for a code used: the group never learns who joined with one (README "Invite codes"). */}
        {entry.action !== 'invite-code.join' && ` · ${who}`}
      </div>
      <div>
        <span className="settings-history-what">{HISTORY_ACTIONS[entry.action] ?? entry.action}</span>
        {count !== null && ` (${count})`}
        {entry.action === 'chapter.update' && (fields.length > 0 ? `: ${fields.join(', ')}` : ': nothing changed')}
      </div>
    </li>
  )
}
