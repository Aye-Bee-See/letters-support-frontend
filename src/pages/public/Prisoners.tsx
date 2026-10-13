import { useMemo } from 'react'
import { getPrisonerFilters, getPrisoners } from '../../api/prisoners'
import { PUBLIC_PAGER } from '../../components/forms/uiClasses'
import { DirectorySearch } from '../../components/ui/DirectoryControls'
import Pager from '../../components/ui/Pager'
import FilterChip from '../../components/ui/FilterChip'
import LoadState from '../../components/ui/LoadState'
import PrisonerTile from '../../components/ui/PrisonerTile'
import { useApi } from '../../hooks/useApi'
import { listSearch, useListParams, useSearchBox } from '../../hooks/useListParams'
import type { PrisonerStatus } from '../../types'
import { STATUS_LABELS } from '../../utils/prisoners'

const STATUS_ORDER: PrisonerStatus[] = ['incarcerated', 'pretrial', 'free']
const PAGE_SIZE = 24

// Markup and classes from solidarity-site/prisoners.html. The API searches,
// filters and pages (README "Searching, filtering, and sorting lists"): a
// search box (`q`), chips from GET /prisoner/filters for the values present,
// one country and one status at a time but the two together, and a pager,
// all kept in the URL under the API's own names.
export default function Prisoners() {
  const { params, page, update } = useListParams()
  const q = params.get('q') ?? ''
  const country = params.get('country') ?? undefined
  const statusParam = params.get('status')
  const status = STATUS_ORDER.find((s) => s === statusParam)
  const filters = useApi(getPrisonerFilters, [])
  const prisoners = useApi(
    () => getPrisoners({ q: q || undefined, country, status, sort: 'name', page, page_size: PAGE_SIZE }),
    [q, country, status, page],
  )
  const [search, setSearch] = useSearchBox(q, (value) => update({ q: value }))

  const countries = useMemo(
    () => (filters.data?.country ?? []).map((c) => c.value).sort((a, b) => a.localeCompare(b)),
    [filters.data],
  )
  const statuses = useMemo(() => {
    const present = new Set((filters.data?.status ?? []).map((s) => s.value))
    return STATUS_ORDER.filter((s) => present.has(s))
  }, [filters.data])

  const total = prisoners.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  /** A chip's link: its own filter on, or off when it is the one on; the others kept. */
  const chip = (key: string, value: string, on: boolean) => `/prisoners${listSearch(params, { [key]: on ? undefined : value })}`

  return (
    <>
      <title>Political Prisoners · letters.support</title>
      <div className="page-hero">
        <div className="wrap">
          <p className="section-label">Directory</p>
          <h1 className="page-title">Political Prisoners</h1>
          <p className="page-subtitle">
            Profiles maintained by support groups and verified by network administrators. Last-verified dates are
            shown on each record.
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="wrap">
          <DirectorySearch label="Search by name" value={search} onChange={setSearch} />
          <span className="filter-label">Filter:</span>
          <FilterChip to={`/prisoners${listSearch(params, { country: undefined, status: undefined })}`} active={!country && !status}>
            All
          </FilterChip>
          {countries.map((c) => (
            <FilterChip key={c} to={chip('country', c, country === c)} active={country === c}>
              {c}
            </FilterChip>
          ))}
          {statuses.map((s) => (
            <FilterChip key={s} to={chip('status', s, status === s)} active={status === s}>
              {STATUS_LABELS[s]}
            </FilterChip>
          ))}
          {prisoners.data && (
            <span className="results-count">
              {total} {total === 1 ? 'record' : 'records'}
            </span>
          )}
        </div>
      </div>

      <div className="index-grid-wrap">
        <div className="wrap">
          <LoadState state={prisoners} what="prisoners" />
          {prisoners.data && total === 0 && <p>{q || country || status ? 'Nobody matches this search.' : 'The directory is empty.'}</p>}
          {prisoners.data && (
            <div className="prisoner-grid">
              {prisoners.data.items.map((p) => (
                <PrisonerTile key={p.id} prisoner={p} since="date" />
              ))}
            </div>
          )}
          {prisoners.data && <Pager classes={PUBLIC_PAGER} page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />}
        </div>
      </div>
    </>
  )
}
