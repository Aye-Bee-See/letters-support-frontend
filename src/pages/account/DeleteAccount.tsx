import { startTransition, useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isApiError, toApiError } from '../../api/client'
import { deleteOwnAccount, fixedOnGroupKeysPage, ownDeleteRefusal } from '../../auth/account'
import { useAuth } from '../../hooks/useAuth'
import CurrentPasswordField from './CurrentPasswordField'

// Delete the signed-in account (README "DELETE /auth/user"). The page says in
// words what goes before anything is sent, as the README asks of clients; the
// current password opens the private key on this device first (as the other
// account pages check it), and the typed username confirms. The API refuses a
// group's owner while the group has other group admins, and the last holder of
// a group's key; both are put right on the group's keys page. A group's managed
// writers belong to the group (`managedBy` is the group, not an admin), so they
// and the letters sent for them stay. Markup from the claim page's classes
// (pages/claim.css), as the other account pages use.

const SECURITY = '/account/security'
const DELETED = 'Your account is deleted.'

export default function DeleteAccount() {
  const { user, keys, endSession } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toKeysPage, setToKeysPage] = useState(false)

  const isGroupAdmin = user?.role === 'chapter'
  const isSiteAdmin = user?.role === 'admin'
  // The label shows the username in capitals (claim-label), so case doesn't count.
  const confirmed = user !== null && typed.trim().toLowerCase() === user.username.toLowerCase()

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!user) return
    if (!password) return setError('Enter your current password.')
    if (!confirmed) return setError('Type your username, to confirm.')
    setBusy(true)
    setError(null)
    setToKeysPage(false)
    try {
      await deleteOwnAccount(user.id, keys, password)
    } catch (err) {
      if (err instanceof Error && !isApiError(err)) {
        // This device's own sentence: the password didn't open the key, or the session has no keys.
        setError(err.message)
      } else {
        const refusal = toApiError(err)
        setError(ownDeleteRefusal(refusal))
        setToKeysPage(isGroupAdmin && fixedOnGroupKeysPage(refusal))
      }
      setBusy(false)
      return
    }
    // Every token of the account stopped working with the request, so there is
    // nothing to sign out of. One transition, so the route's guard doesn't send
    // the person to /login without the notice first.
    startTransition(() => {
      endSession()
      navigate('/login', { replace: true, state: { notice: DELETED } })
    })
  }

  return (
    <div className="claim-page">
      <title>Delete your account · letters.support</title>
      <div className="claim-column is-wide">
        <div className="claim-box">
          {busy ? (
            <div className="claim-state is-active">
              <div className="encrypting-box" role="status">
                <div className="spinner"></div>
                <div className="encrypting-title">Checking your password and deleting your account…</div>
              </div>
            </div>
          ) : (
            <form className="claim-state is-active" onSubmit={onSubmit} noValidate>
              <div className="claim-header">
                <p className="claim-eyebrow">{user?.username}</p>
                <h1 className="claim-title">Delete your account</h1>
                <p className="claim-org-note">This can’t be undone, by you, your group or us.</p>
              </div>
              <div className="claim-body">
                <div className="claim-encryption-note">
                  <p>
                    <strong>What goes, at once and for good:</strong>
                  </p>
                  <ul>
                    <li>every letter you wrote, whatever its status: waiting, printed or mailed;</li>
                    <li>every reply recorded for you, with its photos or scans;</li>
                    <li>
                      your threads, and with them the reply references on your letters: a reply that arrives later can’t be matched to you;
                    </li>
                    <li>your keys: your password and your recovery code open nothing any more;</li>
                    <li>your devices, notifications and every place you’re signed in.</li>
                  </ul>
                  <p>Your username and email are free again straight away. Nothing is kept with your name on it.</p>
                </div>

                {(isGroupAdmin || isSiteAdmin) && (
                  <div className="claim-encryption-note">
                    <p>
                      <strong>What stays:</strong> what you did for {isGroupAdmin ? 'your group' : 'the site'}: decisions, status changes on
                      other people’s letters, invitations, the audit log. They stay without your name on them.
                    </p>
                    {isGroupAdmin && (
                      <>
                        <p>
                          The writers your group looks after belong to the group, not to your account, so they stay, with the letters sent for
                          them. There is nothing to hand off.
                        </p>
                        <p>The server refuses to delete your account while:</p>
                        <ul>
                          <li>
                            you’re your group’s group-owner admin and the group has other group admins: pass ownership to one of them first;
                          </li>
                          <li>
                            you’re the last group admin holding your group’s key: hand the key to another group admin first, or your group
                            could never read its letters again.
                          </li>
                        </ul>
                        <p>
                          Both are done on <Link to="/settings/keys">your group’s keys page</Link>.
                        </p>
                      </>
                    )}
                    {isSiteAdmin && <p>The only site admin account can’t be deleted: make another account a site admin first.</p>}
                  </div>
                )}

                {error && (
                  <div className="claim-error is-visible" role="alert">
                    {error}
                    {toKeysPage && (
                      <>
                        {' '}
                        <Link to="/settings/keys">Go to your group’s keys page</Link>.
                      </>
                    )}
                  </div>
                )}

                <CurrentPasswordField value={password} onChange={setPassword} />
                <div className="claim-field">
                  <label className="claim-label" htmlFor="confirmUsername">
                    To confirm, type your username: <strong>{user?.username}</strong>
                  </label>
                  <input
                    className="claim-input"
                    id="confirmUsername"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </div>
                <button type="submit" className="claim-submit" disabled={!confirmed || !password}>
                  Delete my account and my letters
                </button>
              </div>
            </form>
          )}
        </div>
        {!busy && (
          <Link to={SECURITY} className="claim-back">
            ← Back
          </Link>
        )}
      </div>
    </div>
  )
}
