import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Joined } from '../../auth/join'
import { useAuth } from '../../hooks/useAuth'

/**
 * The recovery code, shown once, straight after an account is made or claimed.
 * The person must confirm they saved it before the session starts. Uses the
 * decided recovery wording (22 Sept note §2). Markup from claim.html's classes.
 */
export default function RecoveryCodeStep({ joined, eyebrow, children }: { joined: Joined; eyebrow: string; children?: ReactNode }) {
  const { startSession } = useAuth()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(joined.recoveryCode)
      setCopied(true)
    } catch {
      // Clipboard unavailable (insecure context, permissions): writing it down still works.
    }
  }

  return (
    <div className="claim-state is-active">
      <div className="claim-header">
        <p className="claim-eyebrow">{eyebrow}</p>
        <h1 className="claim-title">Save your recovery code</h1>
        <p className="claim-org-note">If you ever forget your password, this code is the only way back into your account.</p>
      </div>

      <div className="claim-body">
        {children}

        <div className="claim-encryption-note" style={{ alignItems: 'center', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '1.05rem', letterSpacing: '0.06em', wordBreak: 'break-all' }}>
            {joined.recoveryCode}
          </p>
          <p>
            <button type="button" className="claim-show-pw" style={{ position: 'static' }} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </p>
        </div>

        <div className="claim-encryption-note">
          <p>Write it down, or keep it in a password manager. It is shown only now.</p>
          <p>
            <strong>
              If you lose both your password and your recovery code, your letters cannot be recovered by anyone — not
              your group, not us.
            </strong>
          </p>
        </div>

        <div className="claim-check-row">
          <input type="checkbox" id="recoverySaved" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <label className="claim-check-label" htmlFor="recoverySaved">
            I have saved my recovery code somewhere safe.
          </label>
        </div>

        {joined.signedIn ? (
          <button
            type="button"
            className="claim-submit"
            disabled={!saved}
            onClick={() => {
              if (joined.signedIn) startSession(joined.signedIn)
              navigate('/inbox', { replace: true })
            }}
          >
            Go to your inbox →
          </button>
        ) : (
          <>
            {/* The account uses two-factor sign-in: the new password alone doesn't sign in. */}
            <p className="claim-org-note">Your account uses two-factor sign-in, so sign in with your new password and a code from your authenticator app.</p>
            <button type="button" className="claim-submit" disabled={!saved} onClick={() => navigate('/login', { replace: true })}>
              Sign in →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
