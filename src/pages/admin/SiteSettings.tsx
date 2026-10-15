import { useState } from 'react'
import { Link } from 'react-router-dom'
import { searchAccounts } from '../../api/admin'
import { getGroups } from '../../api/groups'
import { getTwoFactor, getTwoFactorPolicy, resetTwoFactor, setGroupTwoFactor, setTwoFactorPolicy } from '../../api/twoFactor'
import { Section } from '../../components/forms/AdminFormParts'
import RecordPicker from '../../components/forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../../components/forms/recordPickerState'
import { useApi } from '../../hooks/useApi'
import type { ApiError, Chapter, User } from '../../types'
import { ROLE_LABELS } from '../../utils/users'
import { refusalText } from '../../utils/refusals'

// Site settings. Today the API's one site-wide setting is who must use
// two-factor sign-in (README "Two-factor sign-in"): every superadmin, every
// group's admins, or one group's. Writers are never required to. Someone it's
// required of who hasn't set it up can still sign in, and is sent to set it up
// before anything else works (the web, Android; not the iOS app yet).
//
// Also here: resetting someone's two-factor sign-in when they've lost their
// phone and their recovery codes, which requiring it makes necessary.

const errorText = (err: unknown) => {
  const e = err as ApiError
  return e.errors?.length ? e.errors.join(' ') : refusalText(e)
}

export default function SiteSettings() {
  // The policy names its groups, so nothing else is fetched to name them; kept
  // on screen while a change reloads it, so the form isn't rebuilt each time.
  const policy = useApi(getTwoFactorPolicy, [], { keepPrevious: true })
  // Requiring it of superadmins needs your own on first (the API answers 409 own_first).
  const mine = useApi(getTwoFactor, [])

  return (
    <>
      <title>Site settings · Admin · letters.support</title>
      <div className="admin-topbar">
        <span className="topbar-title">Site settings</span>
      </div>
      <div className="admin-content">
        <div className="admin-form">
          <Section title="Two-factor sign-in">
            <p className="form-hint">
              A code from an authenticator app, asked for after the password. Anyone can switch it on for themselves on their{' '}
              <Link to="/account/security">security page</Link>. Here you can require it. Someone it’s required of who hasn’t set it up can still
              sign in, but must set it up before anything else works. That works on the website and the Android app, not yet the iOS app. Writers
              are never required to.
            </p>
            {policy.loading && <p className="dash-note">Loading…</p>}
            {policy.error && (
              <div className="admin-alert admin-alert-err" role="alert">
                Couldn’t load who must use it ({refusalText(policy.error)}).
                <button type="button" className="a-btn a-btn-sm" onClick={policy.reload}>
                  Try again
                </button>
              </div>
            )}
            {policy.data && (
              <PolicyForm
                superadmins={policy.data.superadmins}
                allGroups={policy.data.allGroups}
                groups={policy.data.groups}
                ownOn={mine.data?.enabled ?? null}
                ownError={mine.error}
                onRetryOwn={mine.reload}
                onChanged={policy.reload}
              />
            )}
          </Section>
        </div>

        <div className="admin-form relay-panel">
          <Section title="Reset someone’s two-factor sign-in">
            <p className="form-hint">
              For someone who has lost both their phone and their recovery codes. It switches two-factor sign-in off for their account: they sign in
              with their password, and set it up again if it’s required of them. Make sure it really is them asking.
            </p>
            <ResetTwoFactor />
          </Section>
        </div>
      </div>
    </>
  )
}

interface PolicyProps {
  superadmins: boolean
  allGroups: boolean
  groups: { id: number; name: string }[]
  /** Whether this superadmin has their own on; null while loading or if it couldn't be read. */
  ownOn: boolean | null
  ownError: ApiError | null
  onRetryOwn: () => void
  onChanged: () => void
}

function PolicyForm({ superadmins, allGroups, groups, ownOn, ownError, onRetryOwn, onChanged }: PolicyProps) {
  const [choice, setChoice] = useState<Chapter | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      const e = err as ApiError
      setError(
        e.condition === 'own_first'
          ? 'Switch on two-factor sign-in for your own account first, so this can’t lock you out.'
          : errorText(err),
      )
    } finally {
      setBusy(false)
    }
  }

  // Requiring it of superadmins is offered only once your own is known to be on:
  // not while that's loading, or if it couldn't be read.
  const superadminsBlocked = !superadmins && ownOn !== true

  return (
    <>
      <label className="queue-check">
        <input
          type="checkbox"
          checked={superadmins}
          disabled={busy || superadminsBlocked}
          onChange={(e) => {
            const on = e.target.checked
            const question = on
              ? 'Require two-factor sign-in of every site admin? Any who haven’t set it up will have to before they can do anything else.'
              : 'Stop requiring two-factor sign-in of site admins? Those who have it on keep it.'
            if (window.confirm(question)) void run(() => setTwoFactorPolicy({ superadmins: on }))
          }}
        />
        <span>
          <strong>Every site admin</strong>
        </span>
      </label>
      {superadminsBlocked && ownOn === false && (
        <p className="form-hint">
          Your own isn’t on yet. <Link to="/account/security">Switch it on for your account</Link> first; requiring it of site admins before that
          would lock you out.
        </p>
      )}
      {superadminsBlocked && ownOn === null && !ownError && <p className="form-hint">Checking your own two-factor sign-in…</p>}
      {superadminsBlocked && ownError && (
        <p className="form-hint list-stale">
          Couldn’t check whether your own two-factor sign-in is on ({refusalText(ownError)}), so this can’t be switched on yet.{' '}
          <button type="button" className="link-button" onClick={onRetryOwn}>
            Try again
          </button>
        </p>
      )}

      <label className="queue-check">
        <input
          type="checkbox"
          checked={allGroups}
          disabled={busy}
          onChange={(e) => {
            const on = e.target.checked
            const question = on
              ? 'Require two-factor sign-in of every group’s admins? Any who haven’t set it up will have to the next time they use the site, before anything else works.'
              : 'Stop requiring it of every group’s admins? Groups listed below still require it of their own; those who have it on keep it.'
            if (window.confirm(question)) void run(() => setTwoFactorPolicy({ allGroups: on }))
          }}
        />
        <span>
          <strong>Every group’s admins</strong>
        </span>
      </label>

      <div className="form-group">
        <span className="form-label">Groups that require it of their admins</span>
        {allGroups && (
          <p className="form-hint">
            While “every group’s admins” is on, all of them have to anyway: removing a group here changes nothing until that’s switched off.
          </p>
        )}
        {groups.length === 0 ? (
          <p className="form-static">None.</p>
        ) : (
          <ul className="relay-list">
            {groups.map((g) => (
              <li key={g.id}>
                <Link to={`/admin/groups/${g.id}/edit`}>{g.name}</Link>
                <button
                  type="button"
                  className="a-btn a-btn-sm"
                  disabled={busy}
                  onClick={() => {
                    const question = allGroups
                      ? `Remove ${g.name} from this list? Its admins still have to use two-factor sign-in while it’s required of every group’s admins.`
                      : `Stop requiring two-factor sign-in of ${g.name}’s admins? Those who have it on keep it.`
                    if (window.confirm(question)) void run(() => setGroupTwoFactor(g.id, false))
                  }}
                >
                  {allGroups ? 'Remove from list' : 'Stop requiring'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="relay-add">
          <RecordPicker<Chapter>
            classes={{ input: 'form-input' }}
            label="Group to require it of"
            placeholder="Search groups by name…"
            disabled={busy}
            fetch={(q) => getGroups({ q, sort: 'name', page_size: PICKER_PAGE_SIZE })}
            exclude={groups.map((g) => g.id)}
            render={(g) => g.name}
            onSelect={setChoice}
          />
          {choice && <span className="form-static">{choice.name}</span>}
          <button
            type="button"
            className="a-btn a-btn-sm"
            disabled={!choice || busy}
            onClick={() => {
              const chosen = choice
              if (chosen && window.confirm(`Require two-factor sign-in of ${chosen.name}’s admins?`))
                void run(async () => {
                  await setGroupTwoFactor(chosen.id, true)
                  setChoice(null)
                })
            }}
          >
            Require it
          </button>
        </div>
      </div>

      {error && <div className="admin-alert admin-alert-err" role="alert">{error}</div>}
    </>
  )
}

function ResetTwoFactor() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ q: string; users: User[]; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function search() {
    if (!q.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const found = await searchAccounts(q.trim())
      setResults({ q: q.trim(), users: found.items, total: found.total })
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  async function reset(u: User) {
    if (!window.confirm(`Switch off two-factor sign-in for ${u.username}? Their recovery codes stop working too.`)) return
    setBusy(true)
    setMessage(null)
    try {
      await resetTwoFactor(u.id)
      setResults((r) => r && { ...r, users: r.users.map((x) => (x.id === u.id ? { ...x, twoFactorEnabled: false } : x)) })
      setMessage({ ok: true, text: `Two-factor sign-in is off for ${u.username}. They can sign in with their password.` })
    } catch (err) {
      const e = err as ApiError
      setMessage({ ok: false, text: e.condition === 'not_enabled' ? `${u.username} doesn’t have two-factor sign-in on.` : errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form
        className="relay-add"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <input className="form-input" aria-label="Find an account" placeholder="Username, email or name" value={q} disabled={busy} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="a-btn a-btn-sm" disabled={busy || !q.trim()}>
          Find
        </button>
      </form>
      {results && results.total === 0 && <p className="form-static">No account matches.</p>}
      {results && results.users.length > 0 && (
        <ul className="relay-list">
          {results.users.map((u) => (
            <li key={u.id}>
              <span>
                <Link to={`/admin/users/${u.id}`}>
                  <strong>{u.username}</strong>
                </Link>
                {u.name && <span className="list-sub"> {u.name}</span>}
                <span className="list-sub"> · {ROLE_LABELS[u.role] ?? u.role}</span>
              </span>
              {/* Only where it is on (`twoFactorEnabled`, API #215); an older API that doesn't say gets the button. */}
              {u.twoFactorEnabled === false ? (
                <span className="list-sub">Two-factor sign-in is off</span>
              ) : (
                <button type="button" className="a-btn a-btn-danger a-btn-sm" disabled={busy} onClick={() => void reset(u)}>
                  Reset two-factor
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {results && results.total > results.users.length && (
        <p className="form-hint">
          {results.total} accounts match; these are the first {results.users.length}.{' '}
          <Link to={`/admin/users?q=${encodeURIComponent(results.q)}`}>See them all in Accounts</Link>, or search for more of the name.
        </p>
      )}
      {message && <div className={`admin-alert ${message.ok ? 'admin-alert-ok' : 'admin-alert-err'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}
    </>
  )
}
