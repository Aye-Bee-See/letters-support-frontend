import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAllPrisoners } from '../../api/prisoners'
import FilterChip from '../../components/ui/FilterChip'
import LoadState from '../../components/ui/LoadState'
import PrisonerTile from '../../components/ui/PrisonerTile'
import { useApi } from '../../hooks/useApi'
import type { PrisonerStatus } from '../../types'
import { STATUS_LABELS } from '../../utils/prisoners'

const STATUS_ORDER: PrisonerStatus[] = ['incarcerated', 'pretrial', 'free']

// Markup and classes from solidarity-site/prisoners.html.
// The whole directory is loaded once and filtered here; the chips are built
// from the data (countries and statuses present), one active at a time.
export default function Prisoners() {
  const [params] = useSearchParams()
  const country = params.get('country')
  const status = params.get('status')
  const prisoners = useApi(() => getAllPrisoners({ sort: 'name' }), [])

  const { countries, statuses } = useMemo(() => {
    const all = prisoners.data ?? []
    return {
      countries: [...new Set(all.map((p) => p.country).filter((c): c is string => !!c))].sort((a, b) =>
        a.localeCompare(b),
      ),
      statuses: STATUS_ORDER.filter((s) => all.some((p) => p.status === s)),
    }
  }, [prisoners.data])

  const shown = useMemo(
    () =>
      (prisoners.data ?? []).filter(
        (p) => (!country || p.country === country) && (!status || p.status === status),
      ),
    [prisoners.data, country, status],
  )

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
              {shown.length} {shown.length === 1 ? 'record' : 'records'}
            </span>
          )}
        </div>
      </div>

      <div className="index-grid-wrap">
        <div className="wrap">
          <LoadState state={prisoners} what="prisoners" />
          {prisoners.data && (
            <div className="prisoner-grid">
              {shown.map((p) => (
                <PrisonerTile key={p.id} prisoner={p} since="date" />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
