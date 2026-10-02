import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getGroups, updateGroup, type GroupListParams } from '../../api/groups'
import ListPager from '../../components/ui/ListPager'
import { useApi } from '../../hooks/useApi'
import { useListParams, useSearchBox } from '../../hooks/useListParams'
import type { AccountStatus, ApiError, Chapter, NetworkRole, RecordStatus } from '../../types'

// Every group, pending and suspended included, with the superadmin's one job
// here: approving groups that joined by invitation, and suspending or
// reactivating them (accountStatus is admin-only). full=true adds the
// facilities each relays for. Filters live in the URL under the API's names.

const PAGE_SIZE = 25

const ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended']
const RECORD_STATUSES: RecordStatus[] = ['published', 'pending', 'draft']
/** The API's networkRole filter: a `both` group matches either. */
const ROLES = { collecting: 'Collects letters', relay: 'Prints and mails' } as const
type RoleFilter = keyof typeof ROLES
const ROLE_LABELS: Record<NetworkRole, string> = { collecting: 'Collects', relay: 'Relays', both: 'Collects and relays' }
const SORTS = { name: 'Name', newest: 'Newest', oldest: 'Oldest' } as const
type Sort = keyof typeof SORTS

const oneOf = <T extends string>(values: readonly T[], v: string | null): T | undefined =>
  values.includes(v as T) ? (v as T) : undefined
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function GroupsList() {
  const { params, page, update, clear } = useListParams()
  const q = params.get('q') ?? ''
  const account = oneOf(ACCOUNT_STATUSES, params.get('accountStatus'))
  const role = oneOf(Object.keys(ROLES) as RoleFilter[], params.get('networkRole'))
  const record = oneOf(RECORD_STATUSES, params.get('recordStatus'))
  const sort = oneOf(Object.keys(SORTS) as Sort[], params.get('sort')) ?? 'name'

  const query: GroupListParams = {
    q: q || undefined,
    accountStatus: account,
    networkRole: role,
    recordStatus: record,
    sort,
    full: true,
    page,
    page_size: PAGE_SIZE,
  }
  const list = useApi(() => getGroups(query), [q, account, role, record, sort, page])

  const setParam = (key: string, value: string | undefined) => update({ [key]: value })
  const [search, setSearch] = useSearchBox(q, (value) => update({ q: value }))

  const filtered = Boolean(q || account || role || record)
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Groups</span>
        <span className="topbar-right">{list.data && `${total} ${filtered ? 'matching' : 'in the network'}`}</span>
      </div>

      <div className="admin-content">
        {/* Outside the table's scroll box, so the filters wrap to the page, not the table. */}
        <div className="admin-table-toolbar list-toolbar">
          <input
            type="search"
            className="admin-search"
            placeholder="Search by name"
            aria-label="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="form-select" aria-label="Account status" value={account ?? ''} onChange={(e) => setParam('accountStatus', e.target.value || undefined)}>
            <option value="">Any account status</option>
            {ACCOUNT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {capitalise(s)}
              </option>
            ))}
          </select>
          <select className="form-select" aria-label="Network role" value={role ?? ''} onChange={(e) => setParam('networkRole', e.target.value || undefined)}>
            <option value="">Any role</option>
            {(Object.keys(ROLES) as RoleFilter[]).map((r) => (
              <option key={r} value={r}>
                {ROLES[r]}
              </option>
            ))}
          </select>
          <select className="form-select" aria-label="Record status" value={record ?? ''} onChange={(e) => setParam('recordStatus', e.target.value || undefined)}>
            <option value="">Any record status</option>
            {RECORD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {capitalise(s)}
              </option>
            ))}
          </select>
          <select className="form-select" aria-label="Sort" value={sort} onChange={(e) => setParam('sort', e.target.value === 'name' ? undefined : e.target.value)}>
            {(Object.keys(SORTS) as Sort[]).map((s) => (
              <option key={s} value={s}>
                Sort: {SORTS[s]}
              </option>
            ))}
          </select>
          {filtered && (
            <button
              type="button"
              className="a-btn a-btn-sm"
              onClick={() => {
                setSearch('')
                clear(['sort'])
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="admin-table-wrap">
          {list.loading && <p className="dash-note">Loading groups…</p>}
          {list.error && (
            <p className="dash-note">
              Couldn't load groups ({list.error.message}).{' '}
              <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
                Try again
              </button>
            </p>
          )}
          {/* Nothing matches at all; an empty page past the end is the pager's to explain. */}
          {list.data && list.data.total === 0 && (
            <p className="dash-note">{filtered ? 'No groups match these filters.' : 'There are no groups yet.'}</p>
          )}
          {list.data && list.data.items.length > 0 && <GroupTable groups={list.data.items} onChanged={list.reload} />}
        </div>

        {list.data && <ListPager page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />}
      </div>
    </>
  )
}

const ACCOUNT_BADGES: Record<AccountStatus, string> = { active: 'badge-published', pending: 'badge-draft', suspended: 'badge-pending' }
const RECORD_BADGES: Record<RecordStatus, string> = { published: 'badge-published', pending: 'badge-pending', draft: 'badge-draft' }

function GroupTable({ groups, onChanged }: { groups: Chapter[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function change(g: Chapter, fields: Parameters<typeof updateGroup>[1], question: string) {
    if (!window.confirm(question)) return
    setBusy(g.id)
    setError(null)
    try {
      await updateGroup(g.id, fields)
      onChanged()
    } catch (err) {
      const e = err as ApiError
      setError(`${g.name}: ${e.errors?.length ? e.errors.join(' ') : e.message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {error && <div className="admin-alert admin-alert-err form-error">{error}</div>}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Group</th>
            <th>Role</th>
            <th>Account</th>
            <th>Record</th>
            <th>Group key</th>
            <th>Relays for</th>
            <th>Letters mailed</th>
            <th>
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const relays = g.networkRole !== 'collecting'
            const facilities = g.relay_prisons?.length ?? 0
            return (
              <tr key={g.id}>
                <td>
                  <Link to={`/admin/groups/${g.id}/edit`} className="list-name">
                    {g.name}
                  </Link>
                  <div className="list-sub">{[g.subregion, g.country].filter(Boolean).join(', ') || 'No location listed'}</div>
                </td>
                <td>{ROLE_LABELS[g.networkRole]}</td>
                <td>
                  <span className={`badge ${ACCOUNT_BADGES[g.accountStatus]}`}>{g.accountStatus}</span>
                  {/* The status change sits under the status it changes, not off in the last column. */}
                  <div className="list-action">
                    {g.accountStatus === 'pending' && (
                      <button
                        type="button"
                        className="a-btn a-btn-primary a-btn-sm"
                        disabled={busy !== null}
                        onClick={() =>
                          void change(
                            g,
                            { accountStatus: 'active', recordStatus: 'published' },
                            `Approve ${g.name}? It becomes active (its members can relay and send letters, create writers and propose directory changes) and appears in the public directory.`,
                          )
                        }
                      >
                        Approve
                      </button>
                    )}
                    {g.accountStatus === 'active' && (
                      <button
                        type="button"
                        className="a-btn a-btn-danger a-btn-sm"
                        disabled={busy !== null}
                        onClick={() =>
                          void change(
                            g,
                            { accountStatus: 'suspended' },
                            `Suspend ${g.name}? Its members will be able to read what the public reads, and nothing else: no sending or relaying letters, no new writers, no directory proposals, until it is reactivated.`,
                          )
                        }
                      >
                        Suspend
                      </button>
                    )}
                    {g.accountStatus === 'suspended' && (
                      <button
                        type="button"
                        className="a-btn a-btn-sm"
                        disabled={busy !== null}
                        onClick={() => void change(g, { accountStatus: 'active' }, `Reactivate ${g.name}? Its members can act again straight away.`)}
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </td>
                <td>{g.recordStatus && <span className={`badge ${RECORD_BADGES[g.recordStatus]}`}>{g.recordStatus}</span>}</td>
                <td>
                  {/* In end-to-end mode letters are sealed to the group's key: a relaying group without one can't receive any. */}
                  {g.publicKey ? (
                    'Set'
                  ) : (
                    <span className={relays ? 'list-stale' : 'list-sub'}>
                      None{relays && <span className="visually-hidden"> (it can't receive letters until it has one)</span>}
                    </span>
                  )}
                </td>
                <td>{relays ? `${facilities} ${facilities === 1 ? 'facility' : 'facilities'}` : '—'}</td>
                <td>{g.lettersCounted ?? '—'}</td>
                <td className="actions">
                  <Link to={`/admin/groups/${g.id}/edit`} className="a-btn a-btn-sm">
                    Edit
                  </Link>
                  {g.recordStatus === 'published' && (
                    <Link to={`/groups/${g.id}`} className="a-btn a-btn-sm">
                      View
                    </Link>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
