import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAllPrisoners, getPrisonerFilters } from '../../api/prisoners'
import FilterChip from '../../components/ui/FilterChip'
import LoadState from '../../components/ui/LoadState'
import PrisonerTile from '../../components/ui/PrisonerTile'
import { useApi } from '../../hooks/useApi'
import type { PrisonerStatus } from '../../types'
import { STATUS_LABELS } from '../../utils/prisoners'

const STATUS_ORDER: PrisonerStatus[] = ['incarcerated', 'pretrial', 'free']

// Markup and classes from solidarity-site/prisoners.html. Chips come from
// GET /prisoner/filters (the values present); one is active at a time, kept in
// the URL, and the API returns only the matching records.
export default function Prisoners() {
  const [params] = useSearchParams()
  const country = params.get('country') ?? undefined
  const status = (params.get('status') ?? undefined) as PrisonerStatus | undefined
  const filters = useApi(getPrisonerFilters, [])
  const prisoners = useApi(() => getAllPrisoners({ sort: 'name', country, status }), [country, status])

  const countries = useMemo(
    () => (filters.data?.country ?? []).map((c) => c.value).sort((a, b) => a.localeCompare(b)),
    [filters.data],
  )
  const statuses = useMemo(() => {
    const present = new Set((filters.data?.status ?? []).map((s) => s.value))
    return STATUS_ORDER.filter((s) => present.has(s))
  }, [filters.data])

  const count = prisoners.data?.length ?? 0

  return (
    <>
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
          <span className="filter-label">Filter:</span>
          <FilterChip to="/prisoners" active={!country && !status}>
            All
          </FilterChip>
          {countries.map((c) => (
            <FilterChip key={c} to={`/prisoners?country=${encodeURIComponent(c)}`} active={country === c}>
              {c}
            </FilterChip>
          ))}
          {statuses.map((s) => (
            <FilterChip key={s} to={`/prisoners?status=${s}`} active={status === s}>
              {STATUS_LABELS[s]}
            </FilterChip>
          ))}
          {prisoners.data && (
            <span className="results-count">
              {count} {count === 1 ? 'record' : 'records'}
            </span>
          )}
        </div>
      </div>

      <div className="index-grid-wrap">
        <div className="wrap">
          <LoadState state={prisoners} what="prisoners" />
          {prisoners.data && (
            <div className="prisoner-grid">
              {prisoners.data.map((p) => (
                <PrisonerTile key={p.id} prisoner={p} since="date" />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
