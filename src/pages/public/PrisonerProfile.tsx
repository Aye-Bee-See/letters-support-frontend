import { Link, useParams } from 'react-router-dom'
import { apiUrl } from '../../api/client'
import { getGroup } from '../../api/groups'
import { getPrisoner } from '../../api/prisoners'
import Breadcrumb from '../../components/ui/Breadcrumb'
import LoadState from '../../components/ui/LoadState'
import StatusNotice from '../../components/ui/StatusNotice'
import TagCloud from '../../components/ui/TagCloud'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { Prison } from '../../types'
import { addressLine, mailRuleLines } from '../../utils/facilities'
import { calendarDate, longDate } from '../../utils/dates'
import { displayName, estimatedRelease, otherNames } from '../../utils/prisoners'

/** The prisoner with the whole facility and support groups, plus the verifying group's name. */
async function loadProfile(id: number) {
  const prisoner = await getPrisoner(id, true)
  const verifier = prisoner.verifiedBy ? await getGroup(prisoner.verifiedBy, false).catch(() => null) : null
  return { prisoner, verifierName: verifier?.name ?? null }
}

/** "https://spring96.org/en/" -> "spring96.org/en" */
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

// Markup and classes from solidarity-site/prisoner-profile.html, including its
// print info sheet (pages/prisoner-profile.css, scoped to .profile-layout).
export default function PrisonerProfile() {
  const id = Number(useParams().id)
  const { isWriter } = useAuth()
  const profile = useApi(() => loadProfile(id), [id])

  if (!profile.data) {
    return (
      <>
        <title>Prisoner · letters.support</title>
        <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Prisoners', to: '/prisoners' }, { label: '…' }]} />
        <div className="wrap">
          <LoadState state={profile} what="prisoner" notFound="This prisoner is not in the directory." />
        </div>
      </>
    )
  }

  const { prisoner: p, verifierName } = profile.data
  const name = displayName(p)
  const prison = p.prison_details as Prison | null | undefined
  const address = addressLine(prison?.address)
  const rules = prison ? mailRuleLines(prison) : []
  const aliases = otherNames(p)
  const bio = (p.bio ?? '').split(/\n\s*\n/).filter((para) => para.trim())
  const release = estimatedRelease(p)

  return (
    <>
      <title>{`${name} · letters.support`}</title>
      <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Prisoners', to: '/prisoners' }, { label: name }]} />

      <div className="wrap">
        <div className="profile-layout">
          {/* SIDEBAR */}
          <aside className="profile-sidebar">
            {p.photo ? (
              // style.css styles `.profile-sidebar img`; the prototype only has the placeholder.
              // The credit says where the picture came from or whose permission it is there by.
              <figure className="profile-photo">
                <img src={apiUrl(p.photo.url)} alt={name} />
                {p.photo.credit && <figcaption className="profile-photo-credit">Photo: {p.photo.credit}</figcaption>}
              </figure>
            ) : (
              <div className="profile-sidebar-img-placeholder">Photo</div>
            )}

            <dl className="profile-sidebar-meta">
              {p.country && (
                <>
                  <dt>Country</dt>
                  <dd>{p.country}</dd>
                </>
              )}

              <dt>Current facility</dt>
              <dd>
                {prison ? prison.prisonName : 'Contact a support group for the current address'}
                {address && (
                  <>
                    <br />
                    <span className="address-line">{address}</span>
                  </>
                )}
              </dd>

              {/* Not in the prototype: needed to address a letter. */}
              {p.inmateID && (
                <>
                  <dt>Inmate no.</dt>
                  <dd>{p.inmateID}</dd>
                </>
              )}

              {p.detainedSince && (
                <>
                  <dt>Detained since</dt>
                  <dd>{calendarDate(p.detainedSince, 'long')}</dd>
                </>
              )}

              {p.sentence && (
                <>
                  <dt>Sentence</dt>
                  <dd>{p.sentence}</dd>
                </>
              )}

              {release && (
                <>
                  <dt>Est. release</dt>
                  <dd>{release}</dd>
                </>
              )}

              {p.charges && (
                <>
                  <dt>Charge(s)</dt>
                  <dd>{p.charges}</dd>
                </>
              )}
            </dl>

            <div className="profile-actions">
              {/* Not in the prototype: the way into New Letter for a signed-in writer. */}
              {/* Only with a facility on record: without one there is nowhere to mail a letter. */}
              {/* README "Moved and freed": mail may never reach someone who has left; New Letter asks before sending. The status notice is above the name. */}
              {isWriter && p.prison && p.status === 'free' && (
                <p className="verified-note profile-write">
                  <strong>{name} has been released.</strong> A letter mailed to {prison?.prisonName ?? 'their last facility'} may never reach them.
                </p>
              )}
              {isWriter && p.prison && (
                <Link to={`/letters/new?prisoner=${p.id}`} className="btn btn-sm btn-primary profile-write">
                  Write a letter
                </Link>
              )}
              {isWriter && !p.prison && (
                <p className="verified-note profile-write">
                  No facility is on record for {name} at the moment, so letters can’t be sent through this site.
                </p>
              )}
              <a
                href="#"
                className="print-btn"
                onClick={(e) => {
                  e.preventDefault()
                  window.print()
                }}
              >
                ⎙ Print info sheet
              </a>
            </div>

            <p className="verified-note">
              {p.verifiedAt ? (
                <>
                  Record last verified{verifierName && (
                    <>
                      {' '}by <strong>{verifierName}</strong>
                    </>
                  )}
                  <br />
                  {longDate(p.verifiedAt)}
                </>
              ) : (
                'This record has not been verified yet.'
              )}
            </p>
          </aside>

          {/* MAIN CONTENT */}
          <main>
            <StatusNotice text={p.statusNotice} />
            <h1 className="profile-main-name">{name}</h1>
            {aliases.length > 0 && <p className="profile-aliases">{aliases.join('  ·  ')}</p>}

            {bio.length > 0 && (
              <>
                <h2 className="profile-section-title">About</h2>
                <div className="profile-bio">
                  {bio.map((para, i) => (
                    <p key={i}>
                      {para}
                    </p>
                  ))}
                </div>
              </>
            )}

            {p.interests && p.interests.length > 0 && (
              <>
                <h2 className="profile-section-title">Interests</h2>
                <TagCloud tags={p.interests} className="interests-cloud" />
              </>
            )}

            <h2 className="profile-section-title">Facility mail rules</h2>
            {rules.length > 0 ? (
              <ul className="prison-rule-list">
                {rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            ) : (
              <p>No mail rules are on record for this facility. Check with a support group before writing.</p>
            )}

            {p.supportWebsite && (
              <>
                <h2 className="profile-section-title">Support</h2>
                <p className="profile-support">
                  <a href={p.supportWebsite} target="_blank" rel="noopener noreferrer" className="support-website-link">
                    🔗 {shortUrl(p.supportWebsite)}
                  </a>
                </p>
              </>
            )}

            {p.donationInfo && (
              <>
                <h2 className="profile-section-title">Donate / commissary</h2>
                <div className="donation-text">{p.donationInfo}</div>
              </>
            )}

            {/* Always rendered and always last: the print sheet hides the last
                section title (.profile-section-title:last-of-type) and this list. */}
            <h2 className="profile-section-title">Support groups</h2>
            <div className="support-org-list">
              {p.support_groups?.length ? (
                p.support_groups.map((g) => (
                  <div key={g.id} className="support-org-item">
                    <div>
                      <div className="support-org-item-name">{g.name}</div>
                      {g.PrisonerSupport?.description && (
                        <div className="support-org-item-role">{g.PrisonerSupport.description}</div>
                      )}
                    </div>
                    <Link to={`/groups/${g.id}`} className="btn btn-sm">
                      View group
                    </Link>
                  </div>
                ))
              ) : (
                <p>No groups have listed support for this person yet.</p>
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
