import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useSignOut } from '../../hooks/useSignOut'
import { useUnreadCount } from '../../hooks/useUnreadCount'

// Markup and classes from solidarity-site/index.html and inbox-writer.html.
// The hamburger behaviour replaces solidarity-site/site.js.
export default function Header() {
  const { isAuthenticated, isAdmin, isChapter } = useAuth()
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)

  // Close when tapping outside the menu.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (!toggleRef.current?.contains(target) && !navRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  const signOut = useSignOut()
  // Writers and group admins: what their feed holds unread (one request per page, no polling).
  const unread = useUnreadCount(isAuthenticated && !isAdmin)

  return (
    <header className="site-header">
      <div className="wrap">
        <Link to="/" className="site-logo">
          letters.support
          <span>Political Prisoner Correspondence Network</span>
        </Link>
        <button
          ref={toggleRef}
          className="nav-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="nav-toggle-bar"></span>
          <span className="nav-toggle-bar"></span>
          <span className="nav-toggle-bar"></span>
        </button>
        <nav
          ref={navRef}
          aria-label="Main"
          className={open ? 'site-nav is-open' : 'site-nav'}
          id="site-nav"
          // Close when a link or button in the menu is tapped.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a, button')) setOpen(false)
          }}
        >
          <NavLink to="/prisoners">Prisoners</NavLink>
          <NavLink to="/facilities">Facilities</NavLink>
          <NavLink to="/groups">Groups</NavLink>
          <div className="nav-auth">
            {isAuthenticated ? (
              <>
                <Link
                  to={isAdmin ? '/admin' : '/inbox'}
                  className="btn btn-primary btn-sm"
                  aria-label={!isAdmin && unread ? `Inbox, ${unread} unread` : undefined}
                >
                  {isAdmin ? 'Admin' : 'Inbox'}
                  {/* The unread count, a pill (style.css, .nav-unread). */}
                  {!isAdmin && unread ? (
                    <span className="nav-unread" aria-hidden="true">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  ) : null}
                </Link>
                {/* A group admin's own pages; writers have only their inbox, site admins /admin. */}
                {isChapter && (
                  <>
                    <Link to="/invite-codes" className="nav-auth-link">
                      Invite codes
                    </Link>
                    <Link to="/settings" className="nav-auth-link">
                      Settings
                    </Link>
                  </>
                )}
                <Link to="/account/security" className="nav-auth-link">
                  Security
                </Link>
                {/* The prototype's colours (style.css, .nav-sign-out). */}
                <button type="button" className="btn btn-sm nav-sign-out" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-sm">
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
