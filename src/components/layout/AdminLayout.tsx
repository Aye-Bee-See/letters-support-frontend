import { useLayoutEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { getAdminSummary } from '../../api/admin'
import adminCss from '../../assets/styles/admin.css?inline'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useSignOut } from '../../hooks/useSignOut'

/**
 * admin.css sets global html/body/a rules (font, 14px base, grey background).
 * Imported globally it would restyle the public site, so it is added only while
 * an admin page is mounted and removed when the user leaves the admin area.
 */
export function AdminStyles() {
  useLayoutEffect(() => {
    const style = document.createElement('style')
    style.dataset.stylesheet = 'admin'
    style.textContent = adminCss
    document.head.appendChild(style)
    return () => style.remove()
  }, [])
  return <Outlet />
}

/** A sidebar link's count, as admin.css's `.sidebar-nav .badge`; nothing at zero or before it loads. */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="badge">
      {count}
      <span className="visually-hidden"> waiting</span>
    </span>
  )
}

// Sidebar markup and classes from solidarity-site/admin/dashboard.html.
export default function AdminLayout() {
  const { user } = useAuth()

  const signOut = useSignOut()
  // The sidebar's counts: GET /moderation/summary, once when the admin area opens.
  const summary = useApi(getAdminSummary, [])
  const pending = summary.data ? Object.values(summary.data.pendingSubmissions).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <Link to="/admin" className="sidebar-brand-name">
            letters.support
            <span className="sidebar-brand-sub">Admin</span>
          </Link>
        </div>

        <nav aria-label="Admin">
          <div className="sidebar-section">
            <div className="sidebar-section-label">Overview</div>
            <ul className="sidebar-nav">
              <li><NavLink to="/admin" end>Dashboard</NavLink></li>
              <li><NavLink to="/admin/queue">Moderation Queue<CountBadge count={pending} /></NavLink></li>
              <li><NavLink to="/admin/bans">Block recommendations<CountBadge count={summary.data?.pendingBanRecommendations ?? 0} /></NavLink></li>
            </ul>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-label">Directory</div>
            <ul className="sidebar-nav">
              <li><NavLink to="/admin/prisoners">Prisoners</NavLink></li>
              <li><NavLink to="/admin/facilities">Facilities</NavLink></li>
              <li><NavLink to="/admin/groups">Groups</NavLink></li>
              <li><NavLink to="/admin/mail-rules">Mail rules</NavLink></li>
            </ul>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-label">Administration</div>
            <ul className="sidebar-nav">
              <li><NavLink to="/admin/users">Accounts</NavLink></li>
              <li><NavLink to="/admin/invite">Invite a group</NavLink></li>
              <li><NavLink to="/admin/audit">Audit log</NavLink></li>
              <li><NavLink to="/admin/settings">Site settings</NavLink></li>
            </ul>
          </div>
        </nav>

        <div className="sidebar-footer">
          Signed in as <strong className="sidebar-user">{user?.username}</strong>
          <br />
          <Link to="/account/security">Two-factor sign-in</Link>
          <Link to="/">View public site</Link>
          <button type="button" className="sidebar-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  )
}
