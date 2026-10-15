import { Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getFacility } from '../../api/facilities'
import { getGroup } from '../../api/groups'
import FacilityCorrectionForm from '../../components/forms/FacilityCorrectionForm'
import LoadState from '../../components/ui/LoadState'
import PrisonerTile from '../../components/ui/PrisonerTile'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { addressLines, isStale, mailRuleLines, ROUTING_LABELS, ROUTING_TAGS } from '../../utils/facilities'
import { monthYear } from '../../utils/dates'

/** The facility with its prisoners and relay groups, plus the verifying group's name. */
async function loadFacility(id: number) {
  const facility = await getFacility(id, true)
  const verifier = facility.verifiedBy ? await getGroup(facility.verifiedBy, false).catch(() => null) : null
  return { facility, verifierName: verifier?.name ?? null }
}

/** Whole months since an ISO date. */
function monthsSince(iso: string): number {
  const then = new Date(iso)
  const now = new Date()
  return (now.getUTCFullYear() - then.getUTCFullYear()) * 12 + (now.getUTCMonth() - then.getUTCMonth())
}

/** Text with line breaks as <br> (the prototype's address blocks). */
const Lines = ({ lines }: { lines: string[] }) => (
  <>
    {lines.map((line, i) => (
      <Fragment key={i}>
        {i > 0 && <br />}
        {line}
      </Fragment>
    ))}
  </>
)

// Markup and classes from solidarity-site/facility-profile.html.
export default function FacilityProfile() {
  const id = Number(useParams().id)
  const { isChapter } = useAuth()
  const page = useApi(() => loadFacility(id), [id])

  if (!page.data) {
    return (
      <div className="wrap">
        <title>Facility · letters.support</title>
        <LoadState state={page} what="facility" notFound="This facility is not in the directory." />
      </div>
    )
  }

  const { facility: f, verifierName } = page.data
  const address = addressLines(f)
  const rules = mailRuleLines(f)
  const stale = isStale(f.verifiedAt)
  const months = f.verifiedAt ? monthsSince(f.verifiedAt) : null
  const prisoners = f.prisoners ?? []
  // Only an active group mails anything; a pending or suspended one isn't named.
  const relays = (f.relay_groups ?? []).filter((g) => g.accountStatus === 'active')
  const scanLines = (f.scanService ?? '').split('\n').map((l) => l.trim()).filter(Boolean)

  return (
    <div className="wrap">
      <title>{`${f.prisonName} · letters.support`}</title>
      <div className="facility-layout">
        <main className="facility-main">
          {stale && (
            <div className="stale-banner">
              <span className="stale-banner-icon">⚠</span>
              <span className="stale-banner-text">
                <strong>
                  {months === null
                    ? 'This record has not been verified yet.'
                    : `This record has not been verified in over ${months} months.`}
                </strong>{' '}
                Mail rules and routing details may have changed.
              </span>
            </div>
          )}

          {/* FACILITY HEADER */}
          <div className="facility-header">
            <div className="facility-breadcrumb">
              <Link to="/facilities">Facilities</Link>
              <span>/</span>
              <span className="breadcrumb-current">{f.prisonName}</span>
            </div>
            <h1 className="facility-name">{f.prisonName}</h1>
            {f.country && <p className="facility-country">{f.country}</p>}
            <p className="facility-address">
              <Lines lines={address} />
            </p>
          </div>

          {/* ROUTING METHOD */}
          <div className="facility-section">
            <div className="facility-section-title">Routing</div>
            {f.routing && (
              <div className="routing-method">
                {ROUTING_LABELS[f.routing]}
                <span className="routing-tag">{ROUTING_TAGS[f.routing]}</span>
              </div>
            )}
            {relays.length > 0 && (
              <p className="routing-note">
                Relay {relays.length === 1 ? 'group' : 'groups'}:{' '}
                {relays.map((g, i) => (
                  <Fragment key={g.id}>
                    {i > 0 && ', '}
                    <Link to={`/groups/${g.id}`}>{g.name}</Link>
                  </Fragment>
                ))}
              </p>
            )}
            {/* The facility's public notes (delivery risks and the like). */}
            {f.notes && <p className="routing-note">{f.notes}</p>}
          </div>

          {/* MAIL RULES */}
          <div className="facility-section">
            <div className="facility-section-title">Mail rules</div>
            {rules.length > 0 ? (
              <ul className="mail-rules-list">
                {rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            ) : (
              <p className="routing-note">
                No mail rules are on record for this facility. Check with a support group before writing.
              </p>
            )}
            {scanLines.length > 0 && (
              <div className="scan-service-box">
                <div className="scan-service-heading">Scan service</div>
                <ul className="scan-service-list">
                  {scanLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* PRISONERS CURRENTLY HELD */}
          <div className="facility-section">
            <div className="facility-section-title">Prisoners currently held</div>
            {prisoners.length > 0 ? (
              <div className="facility-prisoner-grid">
                {prisoners.map((p) => (
                  <PrisonerTile key={p.id} prisoner={p} compact />
                ))}
              </div>
            ) : (
              <p className="routing-note">No one in the directory is listed at this facility.</p>
            )}
          </div>

          {/* SUBMIT CORRECTION: group admins only (22 Sept). Superadmins edit directly. */}
          {isChapter && <FacilityCorrectionForm key={f.id} prison={f} />}
        </main>

        {/* SIDEBAR */}
        <aside className="facility-sidebar">
          {f.country && (
            <>
              <div className="fac-sidebar-section">
                <div className="fac-sidebar-heading">Country</div>
                <div className="fac-sidebar-text">
                  <strong>{f.country}</strong>
                </div>
              </div>
              <hr className="fac-sidebar-divider" />
            </>
          )}
          <div className="fac-sidebar-section">
            <div className="fac-sidebar-heading">Mailing address</div>
            <div className="fac-sidebar-address">
              <Lines lines={address} />
            </div>
          </div>
          {f.routing && (
            <>
              <hr className="fac-sidebar-divider" />
              <div className="fac-sidebar-section">
                <div className="fac-sidebar-heading">Routing</div>
                <div className="fac-sidebar-text">{ROUTING_LABELS[f.routing]}</div>
              </div>
            </>
          )}
          <hr className="fac-sidebar-divider" />
          <div className="fac-sidebar-section">
            <div className="fac-sidebar-heading">Prisoners listed</div>
            <div className="fac-sidebar-text">
              <strong>{prisoners.length}</strong>
            </div>
          </div>
          <hr className="fac-sidebar-divider" />
          <div className="fac-sidebar-section">
            <div className="fac-sidebar-heading">Last verified</div>
            <div className={stale ? 'fac-verified stale' : 'fac-verified'}>
              {f.verifiedAt ? (
                <>
                  {monthYear(f.verifiedAt)}
                  <br />
                  <span className="fac-verified-ago">
                    {months === 0 ? 'this month' : `${months} ${months === 1 ? 'month' : 'months'} ago`}
                  </span>
                </>
              ) : (
                'Never'
              )}
            </div>
          </div>
          {verifierName && (
            <>
              <hr className="fac-sidebar-divider" />
              <div className="fac-sidebar-section">
                <div className="fac-sidebar-heading">Verified by</div>
                <div className="fac-sidebar-text">{verifierName}</div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
