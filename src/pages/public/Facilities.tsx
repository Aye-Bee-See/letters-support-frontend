import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getAllFacilities } from '../../api/facilities'
import { getAllGroups } from '../../api/groups'
import FilterChip from '../../components/ui/FilterChip'
import LoadState from '../../components/ui/LoadState'
import StaleWarning from '../../components/ui/StaleWarning'
import { useApi } from '../../hooks/useApi'
import { addressLine, restrictionPhrases, routingLines } from '../../utils/facilities'
import { shortDate } from '../../utils/prisoners'

/** All facilities with their relay groups, plus names for the groups that verified them. */
async function loadFacilities() {
  const facilities = await getAllFacilities({ sort: 'name', full: true })
  const groupNames = new Map<number, string>()
  if (facilities.some((f) => f.verifiedBy)) {
    for (const g of await getAllGroups()) groupNames.set(g.id, g.name)
  }
  return { facilities, groupNames }
}

// Markup and classes from solidarity-site/prisons.html. The whole list is
// loaded once and filtered here; chips are built from the data, one active at
// a time, kept in the URL.
export default function Facilities() {
  const [params] = useSearchParams()
  const country = params.get('country')
  const scanOnly = params.get('routing') === 'scan_only'
  const relay = params.get('relay') === 'true'
  const list = useApi(loadFacilities, [])
  const all = useMemo(() => list.data?.facilities ?? [], [list.data])

  const countries = useMemo(
    () => [...new Set(all.map((f) => f.country).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [all],
  )
  const anyScanOnly = all.some((f) => f.routing === 'scan_only')
  const anyRelay = all.some((f) => f.relay_groups?.length)

  const shown = useMemo(
    () =>
      all.filter(
        (f) =>
          (!country || f.country === country) &&
          (!scanOnly || f.routing === 'scan_only') &&
          (!relay || (f.relay_groups?.length ?? 0) > 0),
      ),
    [all, country, scanOnly, relay],
  )

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
          {anyRelay && (
            <FilterChip to="/facilities?relay=true" active={relay}>
              Relay group available
            </FilterChip>
          )}
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
