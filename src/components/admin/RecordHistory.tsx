import { getFacilityHistory } from '../../api/facilities'
import { getGroupHistory } from '../../api/groups'
import { getPrisonerHistory } from '../../api/prisoners'
import { useApi } from '../../hooks/useApi'
import type { HistoryEntry, SubmissionResource } from '../../types'
import { commonRefusal, otherRefusal } from '../../utils/refusals'
import { Section } from '../forms/AdminFormParts'

// What happened to one directory record (README "The history of one record"):
// GET /prisoner/history, /prison/history or /chapter/history, newest first,
// staff only. The first page, each entry with who, what, when, and its field
// changes as from → to. Entries are routine audit entries, kept 180 days by
// default (README "Retention"). Shared by the three admin edit pages; a group
// admin's own settings page has its own shorter list (pages/org/OrgSettings.tsx).

const PAGE_SIZE = 20

const LOADERS = { prisoner: getPrisonerHistory, prison: getFacilityHistory, chapter: getGroupHistory } as const

/** Each kind of entry in words; an action not listed shows as the API names it. */
const ACTIONS: Record<string, string> = {
  'prisoner.create': 'Record created',
  'prisoner.update': 'Record edited',
  'prisoner.delete': 'Record deleted',
  'prisoner.photo': 'Photo added or replaced',
  'prisoner.photo.remove': 'Photo taken down',
  'prisoner.support.add': 'Support group linked',
  'prisoner.support.remove': 'Support group unlinked',
  'prison.create': 'Record created',
  'prison.update': 'Record edited',
  'prison.delete': 'Record deleted',
  'prison.relay.add': 'Relay group linked',
  'prison.relay.remove': 'Relay group unlinked',
  'chapter.create': 'Group created',
  'chapter.update': 'Record edited',
  'chapter.delete': 'Group deleted',
  'chapter.keys': 'Group key set up',
  'chapter.keys.rotate': 'Group key rotated',
  'chapter.member-key': 'Group key handed to a group admin',
  'chapter.member-key.remove': 'A group admin stopped being handed the group key',
  'chapter.owner': 'Group-owner admin changed',
  'chapter.two-factor': 'Two-factor sign-in requirement changed',
  'chapter.block': 'Writer blocked',
  'chapter.block.remove': 'Writer unblocked',
  'invite-code.issue': 'Invite codes issued',
  'invite-code.cancel': 'Invite codes cancelled',
  'invite-code.join': 'An invite code was used',
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

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

function who(entry: HistoryEntry): string {
  if (!entry.actor) return 'The site itself, or an account since deleted'
  const name = entry.actor.name || entry.actor.username
  return entry.actor.role === 'admin' ? `${name} (site admin)` : name
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
                  <tr key={entry.id}>
                    <td className="dash-nowrap">{when(entry.at)}</td>
                    <td>{who(entry)}</td>
                    <td>
                      <HistoryWhat entry={entry} />
                    </td>
                  </tr>
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
        <strong>{ACTIONS[entry.action] ?? entry.action}</strong>
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
