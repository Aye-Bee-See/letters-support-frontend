import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getGroups } from '../../api/groups'
import { PUBLIC_PAGER } from '../../components/forms/uiClasses'
import { DirectorySearch, FilterSelect } from '../../components/ui/DirectoryControls'
import Pager from '../../components/ui/Pager'
import FilterChip from '../../components/ui/FilterChip'
import LoadState from '../../components/ui/LoadState'
import ServiceTag from '../../components/ui/ServiceTag'
import { useApi } from '../../hooks/useApi'
import { listSearch, useListParams, useSearchBox } from '../../hooks/useListParams'
import type { ChapterService } from '../../types'
import { groupLocation, SERVICE_LABELS } from '../../utils/groups'

const PAGE_SIZE = 24
const SERVICES = Object.keys(SERVICE_LABELS) as ChapterService[]
/** The API's networkRole filter: a group marked `both` matches either. */
const ROLES = { collecting: 'Collecting letters', relay: 'Mailing relay' } as const
type Role = keyof typeof ROLES

// Markup and classes from solidarity-site/groups.html. Only groups admitted to
// the network are listed: the API filters `accountStatus=active` (pending and
// suspended groups are not listed publicly), searches (`q`), filters by
// country, role (`networkRole`) and service, combinable, and pages; all kept
// in the URL under the API's own names. Cards link to the group profile
// (.group-card is styled for a link).
export default function Groups() {
  const { params, page, update } = useListParams()
  const q = params.get('q') ?? ''
  const country = params.get('country') ?? undefined
  // `role` was this page's name for it before the API's; old links still work.
  const roleParam = params.get('networkRole') ?? params.get('role')
  const role = (Object.keys(ROLES) as Role[]).find((r) => r === roleParam)
  const serviceParam = params.get('service')
  const service = SERVICES.find((s) => s === serviceParam)
  const list = useApi(
    () =>
      getGroups({ accountStatus: 'active', q: q || undefined, country, networkRole: role, service, sort: 'name', page, page_size: PAGE_SIZE }),
    [q, country, role, service, page],
  )
  const [search, setSearch] = useSearchBox(q, (value) => update({ q: value }))

  const groups = useMemo(() => list.data?.items ?? [], [list.data])
  // There is no filters endpoint for groups, so the country chips are the
  // countries on this page, plus the one chosen.
  const countries = useMemo(
    () =>
      [...new Set([...groups.map((g) => g.country), country].filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [groups, country],
  )
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = Boolean(country || role || service)
  /** A chip's link: its own filter on, or off when it is the one on; the others kept (and the old `role` dropped). */
  const chip = (key: string, value: string, on: boolean) => `/groups${listSearch(params, { role: undefined, [key]: on ? undefined : value })}`

  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <p className="section-label">Network</p>
          <h1 className="page-title">Support Groups</h1>
          <p className="page-subtitle">
            Groups collecting letters, hosting events, or relaying mail to prisoners. All groups are invited into the
            network by existing members.
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="wrap">
          <DirectorySearch label="Search by name" value={search} onChange={setSearch} />
          <span className="filter-label">Filter:</span>
          <FilterChip to={`/groups${listSearch(params, { country: undefined, role: undefined, networkRole: undefined, service: undefined })}`} active={!filtered}>
            All
          </FilterChip>
          {countries.map((c) => (
            <FilterChip key={c} to={chip('country', c, country === c)} active={country === c}>
              {c}
            </FilterChip>
          ))}
          {(Object.keys(ROLES) as Role[]).map((r) => (
            <FilterChip key={r} to={chip('networkRole', r, role === r)} active={role === r}>
              {ROLES[r]}
            </FilterChip>
          ))}
          <FilterSelect label="Service" any="Any service" value={service ?? ''} onChange={(v) => update({ service: v })}>
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {SERVICE_LABELS[s].charAt(0).toUpperCase() + SERVICE_LABELS[s].slice(1)}
              </option>
            ))}
          </FilterSelect>
          {list.data && (
            <span className="results-count">
              {total} {total === 1 ? 'group' : 'groups'}
            </span>
          )}
        </div>
      </div>

      <div className="groups-grid" style={{ padding: '2.5rem var(--gutter)', maxWidth: 'var(--col)', margin: '0 auto' }}>
        <LoadState state={list} what="groups" />
        {list.data && total === 0 && <p>{q || filtered ? 'No group matches this search.' : 'No groups are listed yet.'}</p>}
        {groups.map((g) => (
          <Link key={g.id} to={`/groups/${g.id}`} className="group-card">
            <div className="group-card-location">{groupLocation(g)}</div>
            <div className="group-card-name">{g.name}</div>
            {g.about && <p className="group-card-body">{g.about}</p>}
            {g.services && g.services.length > 0 && (
              <div className="group-services">
                {g.services.map((s) => (
                  <ServiceTag key={s} service={s} />
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
      {list.data && (
        <div style={{ maxWidth: 'var(--col)', margin: '-1.5rem auto 2.5rem', padding: '0 var(--gutter)' }}>
          <Pager classes={PUBLIC_PAGER} page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />
        </div>
      )}
    </>
  )
}
