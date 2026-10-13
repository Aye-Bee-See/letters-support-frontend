import { Link } from 'react-router-dom'
import { getFacilities, getFacilityFilters, type FacilityListParams } from '../../api/facilities'
import ListPager from '../../components/ui/ListPager'
import { useApi } from '../../hooks/useApi'
import { useListParams, useSearchBox } from '../../hooks/useListParams'
import type { Prison, RecordStatus, RoutingMethod } from '../../types'
import { isStale, ROUTING_LABELS } from '../../utils/facilities'
import { shortDate } from '../../utils/prisoners'

// Every facility record, drafts and pending included (superadmins are staff).
// Rows come without `full`, which would embed every prisoner held at each
// facility: the edit page names the relay groups and the prisoners. Whether a
// facility has an active relay group comes from one more request, the same
// filters with relay=false. Filters live in the URL under the API's own names.

const PAGE_SIZE = 25

const RECORD_STATUSES: RecordStatus[] = ['published', 'pending', 'draft']
const ROUTINGS = Object.keys(ROUTING_LABELS) as RoutingMethod[]
/** relay=true: at least one active relay group; relay=false: none. */
const RELAY = { true: 'Has an active relay group', false: 'No active relay group' } as const
const SORTS = { name: 'Name', newest: 'Newest', oldest: 'Oldest' } as const
type Sort = keyof typeof SORTS

const oneOf = <T extends string>(values: readonly T[], v: string | null): T | undefined =>
  values.includes(v as T) ? (v as T) : undefined

export default function FacilitiesList() {
  const { params, page, update, clear } = useListParams()
  const q = params.get('q') ?? ''
  const record = oneOf(RECORD_STATUSES, params.get('recordStatus'))
  const country = params.get('country') || undefined
  const routing = oneOf(ROUTINGS, params.get('routing'))
  const relay = oneOf(['true', 'false'] as const, params.get('relay'))
  const stale = params.get('stale') === 'true'
  const sort = oneOf(Object.keys(SORTS) as Sort[], params.get('sort')) ?? 'name'

  const query: FacilityListParams = {
    q: q || undefined,
    recordStatus: record,
    country,
    routing,
    ...(relay ? { relay: relay === 'true' } : {}),
    ...(stale ? { stale: true as const } : {}),
    sort,
    page,
    page_size: PAGE_SIZE,
  }
  const list = useApi(() => getFacilities(query), [q, record, country, routing, relay, stale, sort, page])
  // Which of the matching facilities have no active relay group: the same
  // filters with relay=false, ids only. Not needed when the relay filter says.
  const unrelayed = useApi(
    () =>
      relay
        ? Promise.resolve(null)
        : getFacilities({ ...query, relay: false, sort: undefined, page: 1, page_size: 100 }).then((r) =>
            r.total > r.items.length ? null : new Set(r.items.map((f) => f.id)),
          ),
    [q, record, country, routing, relay, stale],
  )
  // The countries present, with counts, for the country filter.
  const filters = useApi(getFacilityFilters, [])

  const setParam = (key: string, value: string | undefined) => update({ [key]: value })
  const [search, setSearch] = useSearchBox(q, (value) => update({ q: value }))

  const filtered = Boolean(q || record || country || routing || relay || stale)
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Facilities</span>
        <span className="topbar-right">
          {list.data && `${total} ${filtered ? 'matching' : 'in the directory'}`}{' '}
          <Link to="/admin/facilities/new" className="a-btn a-btn-primary a-btn-sm">
            New facility
          </Link>
        </span>
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
          <select className="form-select" aria-label="Country" value={country ?? ''} onChange={(e) => setParam('country', e.target.value || undefined)}>
            <option value="">Any country</option>
            {/* A country in the URL that the filter list doesn't have (yet) still shows. */}
            {country && !filters.data?.country.some((c) => c.value === country) && <option value={country}>{country}</option>}
            {filters.data?.country.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value} ({c.count})
              </option>
            ))}
          </select>
          <select className="form-select" aria-label="Routing" value={routing ?? ''} onChange={(e) => setParam('routing', e.target.value || undefined)}>
            <option value="">Any routing</option>
            {ROUTINGS.map((r) => (
              <option key={r} value={r}>
                {ROUTING_LABELS[r]}
              </option>
            ))}
          </select>
          <select className="form-select" aria-label="Relay groups" value={relay ?? ''} onChange={(e) => setParam('relay', e.target.value || undefined)}>
            <option value="">Any relay groups</option>
            {(['true', 'false'] as const).map((r) => (
              <option key={r} value={r}>
                {RELAY[r]}
              </option>
            ))}
          </select>
          <select className="form-select" aria-label="Needs attention" value={stale ? 'true' : ''} onChange={(e) => setParam('stale', e.target.value || undefined)}>
            <option value="">All records</option>
            <option value="true">Needs re-verifying</option>
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
          {list.loading && <p className="dash-note">Loading facilities…</p>}
          {list.error && (
            <p className="dash-note">
              Couldn't load facilities ({list.error.message}).{' '}
              <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
                Try again
              </button>
            </p>
          )}
          {/* Nothing matches at all; an empty page past the end is the pager's to explain. */}
          {list.data && list.data.total === 0 && (
            <p className="dash-note">{filtered ? 'No facilities match these filters.' : 'There are no facilities in the directory yet.'}</p>
          )}
          {list.data && list.data.items.length > 0 && (
            <FacilityTable
              facilities={list.data.items}
              hasRelay={(f) => (relay ? relay === 'true' : unrelayed.data ? !unrelayed.data.has(f.id) : null)}
            />
          )}
        </div>

        {list.data && <ListPager page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />}
      </div>
    </>
  )
}

const RECORD_BADGES: Record<RecordStatus, string> = { published: 'badge-published', pending: 'badge-pending', draft: 'badge-draft' }

/** `hasRelay`: whether the facility has an active relay group; null when not known (over 100 without one). */
function FacilityTable({ facilities, hasRelay }: { facilities: Prison[]; hasRelay: (f: Prison) => boolean | null }) {
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Facility</th>
          <th>Routing</th>
          <th>Active relay group</th>
          <th>Record</th>
          <th>Verified</th>
          <th>
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {facilities.map((f) => {
          const stale = isStale(f.verifiedAt)
          const city = f.address?.city
          return (
            <tr key={f.id}>
              <td>
                <Link to={`/admin/facilities/${f.id}/edit`} className="list-name">
                  {f.prisonName}
                </Link>
                <div className="list-sub">{[city, f.country].filter(Boolean).join(', ') || 'No location listed'}</div>
              </td>
              <td>{f.routing ? ROUTING_LABELS[f.routing] : '—'}</td>
              <td>
                <RelayState facility={f} has={hasRelay(f)} />
              </td>
              <td>{f.recordStatus && <span className={`badge ${RECORD_BADGES[f.recordStatus]}`}>{f.recordStatus}</span>}</td>
              <td className={stale ? 'list-stale' : undefined} title={stale ? 'Needs re-verifying: never verified, or more than six months ago' : undefined}>
                {shortDate(f.verifiedAt) ?? 'Never'}
                {stale && <span className="visually-hidden"> (needs re-verifying)</span>}
              </td>
              <td className="actions">
                <Link to={`/admin/facilities/${f.id}/edit`} className="a-btn a-btn-sm">
                  Edit
                </Link>
                {f.recordStatus === 'published' && (
                  <Link to={`/facilities/${f.id}`} className="a-btn a-btn-sm">
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

/**
 * Whether the facility has an active relay group (the edit page names them).
 * A facility routed "relay only" with none can't be written to at all.
 */
function RelayState({ facility: f, has }: { facility: Prison; has: boolean | null }) {
  if (has === null) return <span className="list-sub">—</span>
  if (has) return <span>Yes</span>
  return f.routing === 'relay_only' ? <span className="list-stale">None: can’t be written to</span> : <span className="list-sub">None</span>
}
