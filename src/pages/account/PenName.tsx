import { useState, type SubmitEvent } from 'react'
import { Navigate, useLocation, useNavigate, type Location } from 'react-router-dom'
import { getMyPenName, setMyPenName } from '../../api/auth'
import PenNameField from '../../components/forms/PenNameField'
import { destination } from '../../components/layout/paths'
import { useAuth } from '../../hooks/useAuth'
import { useSignOut } from '../../hooks/useSignOut'
import type { ApiError } from '../../types'
import { refusalText } from '../../utils/refusals'

// Choosing a pen name, for a writer whose account was made before pen names
// were required (30 September; README "Pen names"). PenNameLock sends them here
// until they do. Markup from the claim page's classes (pages/claim.css), as the
// other account steps use.

const errorText = (err: unknown) => {
  const e = err as ApiError
  return e.errors?.length ? e.errors.join(' ') : refusalText(e)
}

export default function PenName() {
  const { user, isWriter, penNameChosen } = useAuth()
  const navigate = useNavigate()
  const signOut = useSignOut()
  // Where they were going when they were sent here.
  const from = (useLocation().state as { from?: Location } | null)?.from
  const [penName, setPenName] = useState('')
  const [refused, setRefused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only a writer without one is asked.
  if (!user || !isWriter || user.penName) return <Navigate to={destination(from, '/inbox')} replace />

  const ready = penName.trim().length >= 3 && !refused && !busy

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!ready || !user) return
    setBusy(true)
    setError(null)
    try {
      await setMyPenName(user.id, penName.trim())
      // The name as the API stored it (it tidies spacing).
      const stored = await getMyPenName().catch(() => null)
      penNameChosen(stored?.penName ?? penName.trim())
      navigate(destination(from, '/inbox'), { replace: true })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <div className="claim-page">
      <title>Choose a pen name · letters.support</title>
      <div className="claim-column">
        <div className="claim-box">
          <form className="claim-state is-active" onSubmit={onSubmit} noValidate>
            <div className="claim-header">
              <p className="claim-eyebrow">{user.username}</p>
              <h1 className="claim-title">Choose a pen name</h1>
              <p className="claim-org-note">
                Your letters are signed with your pen name, and replies are addressed to it. Your account doesn’t have one yet, so choose one to
                continue.
              </p>
            </div>

            <div className="claim-body">
              {/* A taken name is said once, under the field. */}
              {error && !refused && (
                <span className="claim-error is-visible" role="alert">
                  {error}
                </span>
              )}
              <PenNameField
                value={penName}
                refused={refused}
                onChange={(name, isRefused) => {
                  setPenName(name)
                  setRefused(isRefused)
                }}
                idPrefix="choose"
                hint="3 to 40 characters, and not one anyone else uses. You can change it later."
              />
              <button type="submit" className="claim-submit" disabled={!ready}>
                {busy ? 'Saving…' : 'Use this pen name'}
              </button>
              <p className="claim-org-note claim-org-note-below">
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault()
                    signOut()
                  }}
                >
                  Sign out instead
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
