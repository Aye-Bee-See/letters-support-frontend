import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Joined } from '../../auth/join'
import { useAuth } from '../../hooks/useAuth'
import type { ApiError } from '../../types'

/** Why the sign-in after the account was made failed, as a clause, when there's something to say. */
function signInProblem(error: ApiError): string {
  if (error.status === 429) return ' (too many sign-in attempts from here; wait a few minutes)'
  if (error.status === 0) return ' (the server couldn’t be reached)'
  return ''
}

/** The one line the sign-in page shows on arrival from here. */
function loginNotice(joined: Joined, notice: string): string {
  if (!joined.signInError) return notice
  return joined.signInError.status === 429 ? `${notice} Too many sign-in attempts came from here just now, so wait a few minutes first.` : notice
}

/**
 * The recovery code, shown once, straight after an account is made or claimed.
 * The person must confirm they saved it before the session starts. Uses the
 * decided recovery wording (22 Sept note §2). Markup from claim.html's classes.
 *
 * Shown whenever the account was made, even if signing in afterwards failed:
 * then "Sign in" takes the person to /login, which shows `signInNotice`.
 */
export default function RecoveryCodeStep({
  joined,
  eyebrow,
  signInNotice = 'Your account is made. Sign in with your username and password.',
  children,
}: {
  joined: Joined
  eyebrow: string
  /** What /login says when the person arrives there from this step, not signed in. */
  signInNotice?: string
  children?: ReactNode
}) {
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

        <div className="claim-encryption-note recovery-code-note">
          <p className="recovery-code">
            {joined.recoveryCode}
          </p>
          <p>
            <button type="button" className="claim-show-pw is-static" onClick={copy}>
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
            {joined.signInError ? (
              // Saved, but the sign-in that followed failed. The code is shown anyway: it
              // exists nowhere else, and what made it cannot be done again.
              <p className="claim-org-note">
                Everything is saved, but signing you in didn’t work just now{signInProblem(joined.signInError)}. Once your code is
                saved, sign in with your password.
              </p>
            ) : (
              // The account uses two-factor sign-in: the new password alone doesn't sign in.
              <p className="claim-org-note">Your account uses two-factor sign-in, so sign in with your new password and a code from your authenticator app.</p>
            )}
            <button
              type="button"
              className="claim-submit"
              disabled={!saved}
              onClick={() => navigate('/login', { replace: true, state: { notice: loginNotice(joined, signInNotice) } })}
            >
              Sign in →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
