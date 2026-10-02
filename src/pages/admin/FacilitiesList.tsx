import { Link } from 'react-router-dom'
import { getFacilities, getFacilityFilters, type FacilityListParams } from '../../api/facilities'
import ListPager from '../../components/ui/ListPager'
import { useApi } from '../../hooks/useApi'
import { useListParams, useSearchBox } from '../../hooks/useListParams'
import type { Prison, RecordStatus, RoutingMethod } from '../../types'
import { isStale, ROUTING_LABELS } from '../../utils/facilities'
import { shortDate } from '../../utils/prisoners'

// Every facility record, drafts and pending included (superadmins are staff).
// full=true adds each facility's relay groups and prisoners, which this list
// needs to show who mails there and who is held there. Filters live in the URL
// under the API's own names.

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
    full: true,
    page,
    page_size: PAGE_SIZE,
  }
  const list = useApi(() => getFacilities(query), [q, record, country, routing, relay, stale, sort, page])
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
          {list.data && list.data.items.length === 0 && (
            <p className="dash-note">{filtered ? 'No facilities match these filters.' : 'There are no facilities in the directory yet.'}</p>
          )}
          {list.data && list.data.items.length > 0 && <FacilityTable facilities={list.data.items} />}
        </div>

        <ListPager page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />
      </div>
    </>
  )
}

const RECORD_BADGES: Record<RecordStatus, string> = { published: 'badge-published', pending: 'badge-pending', draft: 'badge-draft' }

function FacilityTable({ facilities }: { facilities: Prison[] }) {
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Facility</th>
          <th>Routing</th>
          <th>Relay groups</th>
          <th>Prisoners</th>
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
                <span className="list-name">{f.prisonName}</span>
                <div className="list-sub">{[city, f.country].filter(Boolean).join(', ') || 'No location listed'}</div>
              </td>
              <td>{f.routing ? ROUTING_LABELS[f.routing] : '—'}</td>
              <td>
                <RelayGroups facility={f} />
              </td>
              <td>{f.prisoners?.length ?? '—'}</td>
              <td>{f.recordStatus && <span className={`badge ${RECORD_BADGES[f.recordStatus]}`}>{f.recordStatus}</span>}</td>
              <td className={stale ? 'list-stale' : undefined} title={stale ? 'Needs re-verifying: never verified, or more than six months ago' : undefined}>
                {shortDate(f.verifiedAt) ?? 'Never'}
                {stale && <span className="visually-hidden"> (needs re-verifying)</span>}
              </td>
              <td className="actions">
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
 * The groups linked to this facility. Only active ones can take letters, so any
 * other is marked; a facility routed "relay only" with no active group can't be
 * written to at all.
 */
function RelayGroups({ facility: f }: { facility: Prison }) {
  const groups = f.relay_groups ?? []
  const active = groups.filter((g) => g.accountStatus === 'active')
  if (groups.length === 0)
    return f.routing === 'relay_only' ? <span className="list-stale">None: can’t be written to</span> : <span className="list-sub">None</span>
  return (
    <>
      {groups.map((g) => (
        <div key={g.id}>
          <Link to={`/groups/${g.id}`}>{g.name}</Link>
          {g.accountStatus !== 'active' && <span className="list-sub"> ({g.accountStatus})</span>}
        </div>
      ))}
      {active.length === 0 && f.routing === 'relay_only' && <div className="list-stale">No active group: can’t be written to</div>}
    </>
  )
}
