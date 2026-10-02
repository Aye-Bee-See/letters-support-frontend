import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getPrisoners, type PrisonerListParams } from '../../api/prisoners'
import { useApi } from '../../hooks/useApi'
import type { Prisoner, PrisonerStatus, RecordStatus } from '../../types'
import { isStale } from '../../utils/facilities'
import { displayName, heldAt, shortDate, STATUS_LABELS } from '../../utils/prisoners'

// Every prisoner record, drafts and pending included (superadmins are staff, so
// GET /prisoner/prisoners returns all record statuses). Filters live in the URL
// under the API's own names (recordStatus, stale=true, addressInDoubt=true), so
// the dashboard can link straight to "addresses in doubt" or "needs re-verifying".

const PAGE_SIZE = 25
/** Wait this long after typing before searching. */
const SEARCH_DELAY_MS = 300

const RECORD_STATUSES: RecordStatus[] = ['published', 'pending', 'draft']
const PRISONER_STATUSES: PrisonerStatus[] = ['incarcerated', 'pretrial', 'free']
/** One select for two of the API's flags; each is its own URL parameter, set to "true". */
const ATTENTION = { stale: 'Needs re-verifying', addressInDoubt: 'Address in doubt' } as const
type Attention = keyof typeof ATTENTION
const SORTS = { name: 'Name', newest: 'Newest', oldest: 'Oldest' } as const
type Sort = keyof typeof SORTS

const oneOf = <T extends string>(values: readonly T[], v: string | null): T | undefined =>
  values.includes(v as T) ? (v as T) : undefined

export default function PrisonersList() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const record = oneOf(RECORD_STATUSES, params.get('recordStatus'))
  const status = oneOf(PRISONER_STATUSES, params.get('status'))
  const stale = params.get('stale') === 'true'
  const addressInDoubt = params.get('addressInDoubt') === 'true'
  const attention: Attention | undefined = stale ? 'stale' : addressInDoubt ? 'addressInDoubt' : undefined
  const sort = oneOf(Object.keys(SORTS) as Sort[], params.get('sort')) ?? 'name'
  const page = Math.max(1, Number(params.get('page')) || 1)

  const query: PrisonerListParams = {
    q: q || undefined,
    recordStatus: record,
    status,
    ...(stale ? { stale: true as const } : {}),
    ...(addressInDoubt ? { addressInDoubt: true as const } : {}),
    sort,
    page,
    page_size: PAGE_SIZE,
  }
  const list = useApi(() => getPrisoners(query), [q, record, status, stale, addressInDoubt, sort, page])

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: key === 'q' })
  }
  const setAttention = (value: Attention | undefined) => {
    const next = new URLSearchParams(params)
    for (const key of Object.keys(ATTENTION)) next.delete(key)
    if (value) next.set(value, 'true')
    next.delete('page')
    setParams(next)
  }

  // The search box updates the URL once typing pauses.
  const [search, setSearch] = useState(q)
  // And follows the URL when it changes some other way (back, forward, a link),
  // so a stale box can't write an old query back. Adjusted during render, as
  // React recommends for state derived from a changing prop.
  const [syncedQ, setSyncedQ] = useState(q)
  if (q !== syncedQ) {
    setSyncedQ(q)
    if (search.trim() !== q) setSearch(q)
  }
  useEffect(() => {
    if (search.trim() === q) return
    const timer = setTimeout(() => setParam('q', search.trim() || undefined), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const filtered = Boolean(q || record || status || attention)
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Prisoners</span>
        <span className="topbar-right">{list.data && `${total} ${filtered ? 'matching' : 'in the directory'}`}</span>
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
          <select className="form-select" aria-label="Record status" value={record ?? ''} onChange={(e) => setParam('recordStatus', e.target.value || undefined)}>
            <option value="">Any record status</option>
            {RECORD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select className="form-select" aria-label="Prisoner status" value={status ?? ''} onChange={(e) => setParam('status', e.target.value || undefined)}>
            <option value="">Any prisoner status</option>
            {PRISONER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select className="form-select" aria-label="Needs attention" value={attention ?? ''} onChange={(e) => setAttention((e.target.value || undefined) as Attention | undefined)}>
            <option value="">All records</option>
            {(Object.keys(ATTENTION) as Attention[]).map((a) => (
              <option key={a} value={a}>
                {ATTENTION[a]}
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
                setParams(sort === 'name' ? {} : { sort })
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="admin-table-wrap">
          {list.loading && <p className="dash-note">Loading prisoners…</p>}
          {list.error && (
            <p className="dash-note">
              Couldn't load prisoners ({list.error.message}).{' '}
              <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
                Try again
              </button>
            </p>
          )}
          {list.data && list.data.items.length === 0 && (
            <p className="dash-note">{filtered ? 'No prisoners match these filters.' : 'There are no prisoners in the directory yet.'}</p>
          )}
          {list.data && list.data.items.length > 0 && <PrisonerTable prisoners={list.data.items} />}
        </div>

        {pages > 1 && (
          <div className="queue-pager">
            <button type="button" className="a-btn a-btn-sm" disabled={page <= 1} onClick={() => setParam('page', page - 1 > 1 ? String(page - 1) : undefined)}>
              ← Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button type="button" className="a-btn a-btn-sm" disabled={page >= pages} onClick={() => setParam('page', String(page + 1))}>
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  )
}

const RECORD_BADGES: Record<RecordStatus, string> = { published: 'badge-published', pending: 'badge-pending', draft: 'badge-draft' }

function PrisonerTable({ prisoners }: { prisoners: Prisoner[] }) {
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Facility</th>
          <th>Status</th>
          <th>Record</th>
          <th>Verified</th>
          <th>
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {prisoners.map((p) => {
          const name = displayName(p)
          const stale = isStale(p.verifiedAt)
          return (
            <tr key={p.id}>
              <td>
                <Link to={`/admin/prisoners/${p.id}/edit`} className="list-name">
                  {name}
                </Link>
                {p.featured && <span className="list-tag">Featured</span>}
                {p.birthName && p.birthName !== name && <div className="list-sub">{p.birthName}</div>}
              </td>
              <td>{heldAt(p.prison_details) ?? <span className="list-sub">Not listed</span>}</td>
              <td>{p.status ? STATUS_LABELS[p.status] : '—'}</td>
              <td>{p.recordStatus && <span className={`badge ${RECORD_BADGES[p.recordStatus]}`}>{p.recordStatus}</span>}</td>
              <td className={stale ? 'list-stale' : undefined} title={stale ? 'Needs re-verifying: never verified, or more than six months ago' : undefined}>
                {shortDate(p.verifiedAt) ?? 'Never'}
                {stale && <span className="visually-hidden"> (needs re-verifying)</span>}
              </td>
              <td className="actions">
                <Link to={`/admin/prisoners/${p.id}/edit`} className="a-btn a-btn-sm">
                  Edit
                </Link>
                {p.recordStatus === 'published' && (
                  <Link to={`/prisoners/${p.id}`} className="a-btn a-btn-sm">
                    View
                  </Link>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
