import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getAllGroups } from '../../api/groups'
import FilterChip from '../../components/ui/FilterChip'
import LoadState from '../../components/ui/LoadState'
import ServiceTag from '../../components/ui/ServiceTag'
import { useApi } from '../../hooks/useApi'
import { collectsLetters, groupLocation, relaysMail } from '../../utils/groups'

/** Groups admitted to the network. Pending and suspended groups are not listed publicly. */
async function loadGroups() {
  const groups = await getAllGroups({ sort: 'name' })
  return groups.filter((g) => g.accountStatus === 'active')
}

// Markup and classes from solidarity-site/groups.html. The whole list is loaded
// once and filtered here; chips are built from the data, one active at a time,
// kept in the URL. Cards link to the group profile (.group-card is styled for a link).
export default function Groups() {
  const [params] = useSearchParams()
  const country = params.get('country')
  const role = params.get('role') // 'collecting' | 'relay'
  const list = useApi(loadGroups, [])
  const all = useMemo(() => list.data ?? [], [list.data])

  const countries = useMemo(
    () => [...new Set(all.map((g) => g.country).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [all],
  )
  const anyCollecting = all.some(collectsLetters)
  const anyRelay = all.some(relaysMail)

  const shown = useMemo(
    () =>
      all.filter(
        (g) =>
          (!country || g.country === country) &&
          (role !== 'collecting' || collectsLetters(g)) &&
          (role !== 'relay' || relaysMail(g)),
      ),
    [all, country, role],
  )

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
          <span className="filter-label">Filter:</span>
          <FilterChip to="/groups" active={!country && !role}>
            All
          </FilterChip>
          {countries.map((c) => (
            <FilterChip key={c} to={`/groups?country=${encodeURIComponent(c)}`} active={country === c}>
              {c}
            </FilterChip>
          ))}
          {anyCollecting && (
            <FilterChip to="/groups?role=collecting" active={role === 'collecting'}>
              Collecting letters
            </FilterChip>
          )}
          {anyRelay && (
            <FilterChip to="/groups?role=relay" active={role === 'relay'}>
              Mailing relay
            </FilterChip>
          )}
          {list.data && (
            <span className="results-count">
              {shown.length} {shown.length === 1 ? 'group' : 'groups'}
            </span>
          )}
        </div>
      </div>

      <div className="groups-grid" style={{ padding: '2.5rem var(--gutter)', maxWidth: 'var(--col)', margin: '0 auto' }}>
        <LoadState state={list} what="groups" />
        {shown.map((g) => (
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
    </>
  )
}
