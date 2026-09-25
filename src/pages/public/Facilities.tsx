import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getAllFacilities, getFacilityFilters, type FacilityListParams } from '../../api/facilities'
import { getAllGroups } from '../../api/groups'
import FilterChip from '../../components/ui/FilterChip'
import LoadState from '../../components/ui/LoadState'
import StaleWarning from '../../components/ui/StaleWarning'
import { useApi } from '../../hooks/useApi'
import { addressLine, restrictionPhrases, routingLines } from '../../utils/facilities'
import { shortDate } from '../../utils/prisoners'

/** The matching facilities with their relay groups, plus names for the groups that verified them. */
async function loadFacilities(filter: Omit<FacilityListParams, 'page' | 'page_size'>) {
  const facilities = await getAllFacilities({ sort: 'name', full: true, ...filter })
  const groupNames = new Map<number, string>()
  if (facilities.some((f) => f.verifiedBy)) {
    for (const g of await getAllGroups()) groupNames.set(g.id, g.name)
  }
  return { facilities, groupNames }
}

// Markup and classes from solidarity-site/prisons.html. Chips come from
// GET /prison/filters (countries and routing methods present); one is active
// at a time, kept in the URL, and the API returns only the matching records.
export default function Facilities() {
  const [params] = useSearchParams()
  const country = params.get('country') ?? undefined
  const scanOnly = params.get('routing') === 'scan_only'
  const relay = params.get('relay') === 'true'
  const filters = useApi(getFacilityFilters, [])
  const list = useApi(
    () => loadFacilities({ country, routing: scanOnly ? 'scan_only' : undefined, relay: relay || undefined }),
    [country, scanOnly, relay],
  )
  const shown = useMemo(() => list.data?.facilities ?? [], [list.data])

  const countries = useMemo(
    () => (filters.data?.country ?? []).map((c) => c.value).sort((a, b) => a.localeCompare(b)),
    [filters.data],
  )
  const anyScanOnly = (filters.data?.routing ?? []).some((r) => r.value === 'scan_only')

  return (
    <>
      <div className="page-hero">
        <div className="wrap">
          <p className="section-label">Directory</p>
          <h1 className="page-title">Facilities &amp; Mail Rules</h1>
          <p className="page-subtitle">
            Mail rules, routing requirements, and known restrictions for each facility. Verify dates are shown — rules
            change without notice. Always confirm before sending a first letter.
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="wrap">
          <span className="filter-label">Filter:</span>
          <FilterChip to="/facilities" active={!country && !scanOnly && !relay}>
            All
          </FilterChip>
          {countries.map((c) => (
            <FilterChip key={c} to={`/facilities?country=${encodeURIComponent(c)}`} active={country === c}>
              {c}
            </FilterChip>
          ))}
          {anyScanOnly && (
            <FilterChip to="/facilities?routing=scan_only" active={scanOnly}>
              Scan service required
            </FilterChip>
          )}
          {/* The filters endpoint has no relay values; like the prototype, this chip is always offered. */}
          <FilterChip to="/facilities?relay=true" active={relay}>
            Relay group available
          </FilterChip>
          {list.data && (
            <span className="results-count">
              {shown.length} {shown.length === 1 ? 'facility' : 'facilities'}
            </span>
          )}
        </div>
      </div>

      <div className="prisons-table-wrap" style={{ maxWidth: 'var(--col)', margin: '0 auto', padding: '2.5rem var(--gutter)' }}>
        <LoadState state={list} what="facilities" />
        {list.data && (
          <table className="prisons-table">
            <thead>
              <tr>
                <th>Facility</th>
                <th>Country</th>
                <th>Routing</th>
                <th>Key restrictions</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => {
                const address = addressLine(f.address)
                const restrictions = restrictionPhrases(f)
                const verifier = f.verifiedBy ? list.data?.groupNames.get(f.verifiedBy) : null
                return (
                  <tr key={f.id}>
                    <td>
                      {/* The prototype's rows link nowhere; the name opens the facility profile. */}
                      <div>
                        <Link to={`/facilities/${f.id}`}>{f.prisonName}</Link>
                      </div>
                      {address && (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--mid)', marginTop: '0.2rem' }}>
                          {address}
                        </div>
                      )}
                    </td>
                    <td>{f.country}</td>
                    <td>
                      {routingLines(f).map((line) => (
                        <div key={line} className="prison-routing">
                          {line}
                        </div>
                      ))}
                    </td>
                    <td style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
                      {restrictions.length ? restrictions.join(' · ') : 'None on record'}
                    </td>
                    <td>
                      {f.verifiedAt && <div className="verified-date">{shortDate(f.verifiedAt)}</div>}
                      <StaleWarning verifiedAt={f.verifiedAt} />
                      {verifier && <div style={{ fontSize: '0.68rem', color: 'var(--mid)' }}>{verifier}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
