import { Fragment, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getFacilityHistory } from '../../api/facilities'
import { getGroupHistory } from '../../api/groups'
import { getPrisonerHistory } from '../../api/prisoners'
import { getAccountsByIds } from '../../api/users'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { HistoryEntry, SubmissionResource } from '../../types'
import { dateTime } from '../../utils/dates'
import {
  accountName,
  actorName,
  actorsOf,
  detailAccountIds,
  detailAccounts,
  detailLabel,
  detailWord,
  historyAction,
  isAccountDetail,
  type Actor,
  type NamedAccounts,
} from '../../utils/history'
import { commonRefusal, otherRefusal } from '../../utils/refusals'
import { Section } from '../forms/AdminFormParts'

// What happened to one directory record (README "The history of one record"):
// GET /prisoner/history, /prison/history or /chapter/history, newest first,
// staff only. The first page, each entry with who, what, when, and its field
// changes as from → to. Entries are routine audit entries, kept 180 days by
// default (README "Retention"). Shared by the three admin edit pages. A group
// admin's own settings page (pages/org/OrgSettings.tsx) has its own shorter
// list, of the same entries: HistoryItem with variant "group".
//
// Some of a group's entries name people by account id in their details (who
// was handed the key, who the ownership went to). Those are looked up and
// named, and here linked to the account's page (issue #68): the entries'
// own actors cost nothing, the rest are GET /auth/user?id=, which a site admin
// may ask of anyone and these pages are a site admin's (RequireAdmin).

const PAGE_SIZE = 20

const LOADERS = { prisoner: getPrisonerHistory, prison: getFacilityHistory, chapter: getGroupHistory } as const

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "mailRules" → "Mail rules". */
const fieldLabel = (field: string) => {
  const words = field.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(', ') : '—'
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? dateTime(value) : value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  // An object (an address) as JSON, never "[object Object]".
  return JSON.stringify(value) ?? '—'
}

export default function RecordHistory({ resource, id, version }: { resource: SubmissionResource; id: number; version?: string }) {
  // `version` (the record's updatedAt) asks again after the page saves the record.
  const history = useApi(() => LOADERS[resource](id, { page: 1, page_size: PAGE_SIZE }), [resource, id, version ?? null], { keepPrevious: true })
  const accounts = useNamedAccounts(history.data?.items)

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
                  <HistoryItem key={entry.id} entry={entry} variant="admin" accounts={accounts} accountLink={(account) => `/admin/users/${account}`} />
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
 * The accounts the entries' details name by id, for a site admin: the entries'
 * own actors, and the rest looked up once for the page. Undefined while the
 * lookup is on its way.
 */
function useNamedAccounts(entries: HistoryEntry[] | undefined): NamedAccounts | undefined {
  const known = useMemo(() => actorsOf(entries ?? []), [entries])
  const missing = useMemo(() => detailAccountIds(entries ?? []).filter((id) => !known.has(id)), [entries, known])
  const looked = useApi(() => (missing.length ? getAccountsByIds(missing) : Promise.resolve(null)), [missing.join(',')], { keepPrevious: true })
  return useMemo(() => {
    if (missing.length > 0 && !looked.data && !looked.error) return undefined
    return new Map<number, Actor | null>([...known, ...(looked.data ?? [])])
  }, [known, missing, looked.data, looked.error])
}

interface HistoryItemProps {
  entry: HistoryEntry
  variant: 'admin' | 'group'
  /** The accounts the entry's details name by id; undefined while they are being looked up. */
  accounts?: NamedAccounts
  /** Where a named account's own page is, for whoever may open it (a site admin). */
  accountLink?: (id: number) => string
}

/**
 * One entry, with who and when. Variant "admin": a row of the admin pages'
 * table, the field changes as from → to. Variant "group": a line of the group
 * settings page's list (pages/org-settings.css), the changed fields named.
 */
export function HistoryItem({ entry, variant, accounts, accountLink }: HistoryItemProps) {
  const { user } = useAuth()
  const who = actorName(entry.actor, user?.id)
  if (variant === 'group') return <GroupLine entry={entry} who={who} accounts={accounts} me={user?.id} />
  return (
    <tr>
      <td className="dash-nowrap">{dateTime(entry.at)}</td>
      <td>{capitalise(who)}</td>
      <td>
        <HistoryWhat entry={entry} accounts={accounts} accountLink={accountLink} me={user?.id} />
      </td>
    </tr>
  )
}

/** The people one detail names, each by name and, where there is a page to open, linked to it. */
function People({ ids, accounts, accountLink, me }: { ids: number[]; accounts?: NamedAccounts; accountLink?: (id: number) => string; me?: number }) {
  if (ids.length === 0) return <>nobody</>
  if (!accounts) return <>…</>
  return (
    <>
      {ids.map((id, i) => {
        const name = accountName(id, accounts, me)
        // No page to link for an account that is gone.
        const linked = accountLink && accounts.get(id) !== null
        return (
          <Fragment key={id}>
            {i > 0 && ', '}
            {linked ? <Link to={accountLink(id)}>{name}</Link> : name}
          </Fragment>
        )
      })}
    </>
  )
}

/** The action in words, its field changes as from → to, and anything else it recorded. */
function HistoryWhat({ entry, accounts, accountLink, me }: { entry: HistoryEntry; accounts?: NamedAccounts; accountLink?: (id: number) => string; me?: number }) {
  const changes = Object.entries(entry.changes ?? {})
  // `replaced` on a photo entry is said in the action's words (historyAction), not listed.
  const { viaSubmission, ...details } = entry.details ?? {}
  const otherDetails = Object.entries(details).filter(([key]) => key !== 'replaced')
  const isEdit = entry.action.endsWith('.update')
  return (
    <>
      <div>
        <strong>{historyAction(entry.action, entry.details)}</strong>
        {typeof viaSubmission === 'number' && <span className="list-sub"> · from proposal #{viaSubmission}</span>}
        {isEdit && changes.length === 0 && <span className="list-sub"> · saved with nothing changed</span>}
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
              <dt>{detailLabel(entry.action, key) ?? fieldLabel(key)}</dt>
              <dd>
                {isAccountDetail(entry.action, key) ? (
                  <People ids={detailAccounts(entry.action, key, value)} accounts={accounts} accountLink={accountLink} me={me} />
                ) : (
                  (detailWord(entry.action, key, value) ?? formatValue(value))
                )}
              </dd>
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

/**
 * The people a group's entry names, for its own settings page: "Sam", "from
 * Sam, to Alex", "first key holder you, group-owner admin you". A group can
 * name only the people it can list (api/groups.ts getGroupPeople), so a group
 * admin it can't is said as one who has left, and a writer it can't (one since
 * unblocked) isn't said at all: the action already says a writer.
 */
function peopleNamed(entry: HistoryEntry, accounts: NamedAccounts, me: number | undefined): string {
  const parts = Object.entries(entry.details ?? {})
    .filter(([key]) => isAccountDetail(entry.action, key))
    .map(([key, value]) => {
      const ids = detailAccounts(entry.action, key, value)
      const names =
        key === 'writer'
          ? ids.filter((id) => id === me || accounts.get(id) != null).map((id) => accountName(id, accounts, me))
          : ids.map((id) => accountName(id, accounts, me, 'someone no longer in the group'))
      return { key, names: ids.length === 0 && key !== 'writer' ? ['nobody'] : names }
    })
    .filter((part) => part.names.length > 0)
  // One kind of person needs no label: the action's own words say who they are.
  if (parts.length === 1 && parts[0].key !== 'from' && parts[0].key !== 'to') return parts[0].names.join(', ')
  return parts.map(({ key, names }) => `${(detailLabel(entry.action, key) ?? key).toLowerCase()} ${names.join(', ')}`).join(', ')
}

/** The group settings page's line: when and who, then the action, with a count, the fields an edit changed, or the people it names. */
function GroupLine({ entry, who, accounts, me }: { entry: HistoryEntry; who: string; accounts?: NamedAccounts; me?: number }) {
  const fields = Object.keys(entry.changes ?? {}).map((f) => FIELD_NAMES[f] ?? f)
  const count = typeof entry.details?.count === 'number' ? entry.details.count : typeof entry.details?.cancelled === 'number' ? entry.details.cancelled : null
  const people = accounts ? peopleNamed(entry, accounts, me) : ''
  return (
    <li>
      <div className="settings-history-when">
        {dateTime(entry.at)}
        {/* Nobody is named for a code used: the group never learns who joined with one (README "Invite codes"). */}
        {entry.action !== 'invite-code.join' && ` · ${who}`}
      </div>
      <div>
        <span className="settings-history-what">{historyAction(entry.action, entry.details)}</span>
        {count !== null && ` (${count})`}
        {entry.action === 'chapter.update' && (fields.length > 0 ? `: ${fields.join(', ')}` : ': nothing changed')}
        {people && `: ${people}`}
      </div>
    </li>
  )
}
