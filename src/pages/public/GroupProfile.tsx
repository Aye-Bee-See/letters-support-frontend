import { Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getGroup } from '../../api/groups'
import LoadState from '../../components/ui/LoadState'
import PrisonerTile from '../../components/ui/PrisonerTile'
import ServiceTag from '../../components/ui/ServiceTag'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { SocialLinkKey } from '../../types'
import { SERVICE_LABELS } from '../../utils/groups'

const SOCIAL: [SocialLinkKey, string, string][] = [
  ['instagram', '📷', 'Instagram'],
  ['mastodon', '🐘', 'Mastodon'],
  ['bluesky', '🦋', 'Bluesky'],
  ['x', '𝕏', 'X'],
  ['youtube', '▶', 'YouTube'],
]

const isUrl = (s: string) => /^https?:\/\//i.test(s)
/** "https://www.portlandabc.org/" -> "portlandabc.org" */
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

// Markup and classes from solidarity-site/group-profile.html. full=true embeds the
// prisoners the group mails directly to (each with its facility) and the
// facilities it relays for.
export default function GroupProfile() {
  const id = Number(useParams().id)
  const { user, isAdmin } = useAuth()
  const page = useApi(() => getGroup(id, true), [id])

  if (!page.data) {
    return (
      <div className="wrap">
        <LoadState state={page} what="group" />
      </div>
    )
  }

  const g = page.data
  const about = (g.about ?? '').split(/\n\s*\n/).filter((para) => para.trim())
  const socials = SOCIAL.filter(([key]) => g.socialLinks?.[key]?.trim())
  const supported = g.supported_prisoners ?? []
  const relayFor = g.relay_prisons ?? []
  const isOwnGroup = user?.role === 'chapter' && user.chapterId === g.id

  return (
    <div className="wrap" style={{ paddingTop: 0, paddingBottom: 0 }}>
      <div className="group-layout">
        <main className="group-main">
          {g.announcement && <div className="group-announcement">{g.announcement}</div>}

          {/* GROUP HEADER */}
          <div className="group-header">
            <div className="group-breadcrumb">
              <Link to="/groups">Groups</Link>
              <span>/</span>
              <span style={{ color: 'var(--text)' }}>{g.name}</span>
            </div>
            <h1 className="group-name">{g.name}</h1>
            <p className="group-location">{[g.subregion, g.country].filter(Boolean).join(' — ')}</p>

            {(g.website || g.email) && (
              <div className="group-primary-links">
                {g.website && (
                  <a href={g.website} target="_blank" rel="noopener noreferrer" className="group-website-link">
                    <span>🔗</span> {shortUrl(g.website)}
                  </a>
                )}
                {g.email && (
                  <a href={`mailto:${g.email}`} className="group-email-link">
                    <span>✉</span> {g.email}
                  </a>
                )}
              </div>
            )}

            {socials.length > 0 && (
              <div className="group-social-links">
                {socials.map(([key, icon, label]) => {
                  const value = g.socialLinks![key]!.trim()
                  // A URL links; anything else (a bare handle) is shown as text.
                  return isUrl(value) ? (
                    <a key={key} href={value} target="_blank" rel="noopener noreferrer" className="social-link">
                      <span className="social-icon">{icon}</span> {label}
                    </a>
                  ) : (
                    <span key={key} className="social-link">
                      <span className="social-icon">{icon}</span> {label}: {value}
                    </span>
                  )
                })}
              </div>
            )}

            {g.services && g.services.length > 0 && (
              <div className="group-services">
                {g.services.map((s) => (
                  <ServiceTag key={s} service={s} />
                ))}
              </div>
            )}
          </div>

          {/* ABOUT */}
          {about.length > 0 && (
            <div className="group-section">
              <div className="group-section-title">About</div>
              <div className="group-about">
                {about.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </div>
          )}

          {/* PRISONERS SUPPORTED */}
          <div className="group-section">
            <div className="group-section-title">Prisoners we mail directly to</div>
            {supported.length > 0 ? (
              <div className="group-prisoner-grid">
                {supported.map((p) => (
                  <PrisonerTile key={p.id} prisoner={p} showRelease={false} />
                ))}
              </div>
            ) : (
              <p className="sidebar-text">This group does not list anyone it mails to directly yet.</p>
            )}
          </div>
        </main>

        {/* SIDEBAR */}
        <aside className="group-sidebar">
          {/* Group controls: this group's own admins, and superadmins. */}
          {(isOwnGroup || isAdmin) && (
            <>
              <div className="sidebar-section">
                <Link to={isOwnGroup ? '/settings' : `/admin/groups/${g.id}/edit`} className="sidebar-org-link">
                  ⚙ Group settings &amp; announcement
                </Link>
              </div>
              <hr className="sidebar-divider" />
            </>
          )}

          <div className="sidebar-section">
            <div className="sidebar-section-heading">Location</div>
            <div className="sidebar-text">
              {g.subregion && (
                <>
                  {g.subregion}
                  <br />
                </>
              )}
              {g.country}
            </div>
          </div>

          {g.services && g.services.length > 0 && (
            <>
              <hr className="sidebar-divider" />
              <div className="sidebar-section">
                <div className="sidebar-section-heading">Services</div>
                <div className="sidebar-text">
                  {g.services.map((s, i) => (
                    <Fragment key={s}>
                      {i > 0 && <br />}
                      {SERVICE_LABELS[s].charAt(0).toUpperCase() + SERVICE_LABELS[s].slice(1)}
                    </Fragment>
                  ))}
                </div>
              </div>
            </>
          )}

          <hr className="sidebar-divider" />
          <div className="sidebar-section">
            <div className="sidebar-section-heading">Mailing directly to</div>
            <div className="sidebar-text">
              <strong>{supported.length}</strong>
            </div>
          </div>

          {/* Counted by the server; null until the group has mailed 20 letters. */}
          {g.lettersSent && (
            <>
              <hr className="sidebar-divider" />
              <div className="sidebar-section">
                <div className="sidebar-section-heading">Letters mailed</div>
                <div className="sidebar-text">
                  <strong>{g.lettersSent}</strong>
                  {g.averageTimeDays != null && (
                    <>
                      <br />
                      usually mailed within {g.averageTimeDays} {g.averageTimeDays === 1 ? 'day' : 'days'}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {relayFor.length > 0 && (
            <>
              <hr className="sidebar-divider" />
              <div className="sidebar-section">
                <div className="sidebar-section-heading">Relays mail to</div>
                <div className="sidebar-text">
                  {relayFor.map((f, i) => (
                    <Fragment key={f.id}>
                      {i > 0 && <br />}
                      <Link to={`/facilities/${f.id}`}>{f.prisonName}</Link>
                    </Fragment>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
