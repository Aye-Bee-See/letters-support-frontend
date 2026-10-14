import { Link } from 'react-router-dom'

// Markup and classes from solidarity-site/index.html.
// The prototype's "Submit a correction" link is gone: since 22 Sept there is no
// public correction form; third parties write to the listed contact address.
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div>
          <p className="footer-brand">letters.support</p>
          <p className="footer-copy">
            A volunteer-maintained directory for political prisoner correspondence. Information is submitted by
            support groups and verified by network administrators.
          </p>
        </div>
        <nav className="footer-nav" aria-label="Footer">
          <div className="footer-nav-col">
            <span className="footer-nav-heading">Directory</span>
            <Link to="/prisoners">Prisoners</Link>
            <Link to="/facilities">Facilities</Link>
            <Link to="/groups">Groups</Link>
          </div>
          <div className="footer-nav-col">
            <span className="footer-nav-heading">Network</span>
            <Link to="/about">About this site</Link>
            <Link to="/about">Contact admins</Link>
          </div>
        </nav>
      </div>
    </footer>
  )
}
