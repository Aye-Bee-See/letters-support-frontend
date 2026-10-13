import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getFacilities, getFacilityFilters, getMailRules, type FacilityListParams } from '../../api/facilities'
import { getGroupsByIds } from '../../api/groups'
import { DirectoryPager, DirectorySearch, FilterSelect } from '../../components/ui/DirectoryControls'
import FilterChip from '../../components/ui/FilterChip'
import LoadState from '../../components/ui/LoadState'
import StaleWarning from '../../components/ui/StaleWarning'
import { useApi } from '../../hooks/useApi'
import { listSearch, useListParams, useSearchBox } from '../../hooks/useListParams'
import type { RoutingMethod } from '../../types'
import { addressLine, restrictionPhrases, ROUTING_LABELS, routingLines } from '../../utils/facilities'
import { shortDate } from '../../utils/prisoners'

const PAGE_SIZE = 25
const ROUTINGS = Object.keys(ROUTING_LABELS) as RoutingMethod[]

/**
 * Languages offered in the language filter, as ISO 639-1 codes. The API has
 * no list of the languages facilities name, so this is a fixed one; a code
 * from a link that isn't on it is offered too.
 */
const LANGUAGES = ['ar', 'be', 'de', 'el', 'en', 'es', 'fa', 'fr', 'he', 'it', 'ka', 'ku', 'pl', 'pt', 'ru', 'tr', 'uk', 'zh']
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
const languageName = (code: string) => languageNames.of(code) ?? code

/** One page of matching facilities, plus names for the groups that verified them (one small request each). */
async function loadFacilities(params: FacilityListParams) {
  const page = await getFacilities(params)
  const verifiers = page.items.map((f) => f.verifiedBy).filter((id): id is number => typeof id === 'number')
  const groupNames = verifiers.length ? await getGroupsByIds(verifiers) : new Map()
  return { page, groupNames }
}

// Markup and classes from solidarity-site/prisons.html. The API searches,
// filters and pages (README "Searching, filtering, and sorting lists"): a
// search box (`q`), chips for the countries and routing methods present
// (GET /prison/filters) and for a relay group, dropdowns for a language a
// letter is written in and a mail rule, all combinable and kept in the URL
// under the API's own names. Rows come without `full`, so without each
// facility's prisoners and relay groups: the facility's page names its groups.
export default function Facilities() {
  const { params, page, update } = useListParams()
  const q = params.get('q') ?? ''
  const country = params.get('country') ?? undefined
  const routingParam = params.get('routing')
  const routing = ROUTINGS.find((r) => r === routingParam)
  const relay = params.get('relay') === 'true'
  const languageParam = params.get('language') ?? ''
  const language = /^[a-z]{2}$/.test(languageParam) ? languageParam : undefined
  const mailRule = params.get('mailRule') || undefined

  const filters = useApi(getFacilityFilters, [])
  const rules = useApi(() => getMailRules(), [])
  const list = useApi(
    () =>
      loadFacilities({
        q: q || undefined,
        country,
        routing,
        relay: relay || undefined,
        language,
        mailRule,
        sort: 'name',
        page,
        page_size: PAGE_SIZE,
      }),
    [q, country, routing, relay, language, mailRule, page],
  )
  const [search, setSearch] = useSearchBox(q, (value) => update({ q: value }))

  const countries = useMemo(
    () => (filters.data?.country ?? []).map((c) => c.value).sort((a, b) => a.localeCompare(b)),
    [filters.data],
  )
  const routings = useMemo(() => {
    const present = new Set((filters.data?.routing ?? []).map((r) => r.value))
    return ROUTINGS.filter((r) => present.has(r))
  }, [filters.data])
  const languages = useMemo(
    () => [...new Set([...LANGUAGES, ...(language ? [language] : [])])].sort((a, b) => languageName(a).localeCompare(languageName(b))),
    [language],
  )

  const rows = list.data?.page.items ?? []
  const total = list.data?.page.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = Boolean(country || routing || relay || language || mailRule)
  /** A chip's link: its own filter on, or off when it is the one on; the others kept. */
  const chip = (key: string, value: string, on: boolean) => `/facilities${listSearch(params, { [key]: on ? undefined : value })}`

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
          <DirectorySearch label="Search by name" value={search} onChange={setSearch} />
          <span className="filter-label">Filter:</span>
          <FilterChip
            to={`/facilities${listSearch(params, { country: undefined, routing: undefined, relay: undefined, language: undefined, mailRule: undefined })}`}
            active={!filtered}
          >
            All
          </FilterChip>
          {countries.map((c) => (
            <FilterChip key={c} to={chip('country', c, country === c)} active={country === c}>
              {c}
            </FilterChip>
          ))}
          {routings.map((r) => (
            <FilterChip key={r} to={chip('routing', r, routing === r)} active={routing === r}>
              {ROUTING_LABELS[r]}
            </FilterChip>
          ))}
          {/* The filters endpoint has no relay values; like the prototype, this chip is always offered. */}
          <FilterChip to={chip('relay', 'true', relay)} active={relay}>
            Relay group available
          </FilterChip>
          <FilterSelect label="Language the letter is written in" any="Any language" value={language ?? ''} onChange={(v) => update({ language: v })}>
            {languages.map((code) => (
              <option key={code} value={code}>
                Accepts {languageName(code)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Mail rule" any="Any mail rule" value={mailRule ?? ''} onChange={(v) => update({ mailRule: v })}>
            {/* A rule in the URL that the list doesn't have (retired, or not loaded yet) still shows. */}
            {mailRule && !rules.data?.rules.some((r) => r.tag === mailRule) && <option value={mailRule}>{mailRule}</option>}
            {(rules.data?.rules ?? []).map((r) => (
              <option key={r.tag} value={r.tag}>
                {r.label}
              </option>
            ))}
          </FilterSelect>
          {list.data && (
            <span className="results-count">
              {total} {total === 1 ? 'facility' : 'facilities'}
            </span>
          )}
        </div>
      </div>

      <div className="prisons-table-wrap" style={{ maxWidth: 'var(--col)', margin: '0 auto', padding: '2.5rem var(--gutter)' }}>
        <LoadState state={list} what="facilities" />
        {list.data && total === 0 && <p>{q || filtered ? 'No facility matches this search.' : 'There are no facilities in the directory yet.'}</p>}
        {list.data && rows.length > 0 && (
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
              {rows.map((f) => {
                const address = addressLine(f.address)
                const restrictions = restrictionPhrases(f)
                const verifier = f.verifiedBy ? list.data?.groupNames.get(f.verifiedBy)?.name : null
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
        {list.data && <DirectoryPager page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />}
      </div>
    </>
  )
}
