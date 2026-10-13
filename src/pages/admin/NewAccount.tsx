import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getEncryptionReadiness } from '../../api/admin'
import { getGroups } from '../../api/groups'
import { createStaffAccount } from '../../auth/staffAccount'
import { Field, Section } from '../../components/forms/AdminFormParts'
import RecordPicker from '../../components/forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../../components/forms/recordPickerState'
import { useApi } from '../../hooks/useApi'
import type { ApiError, Chapter } from '../../types'
import { MIN_PASSWORD_LENGTH, passwordStrength } from '../../utils/password'
import { createRefusal } from '../../utils/users'

// A staff account made by a site admin (POST /auth/user, README "Creating
// accounts with other roles"): a group admin or a site admin, with no pen name.
// The password the site admin types is split on this device and never sent
// (auth/staffAccount.ts). No keys are made here: a site admin must
// never hold anyone's private key, so the account gets them at its first
// sign-in on a phone app, and the web refuses it until then.
//
// That only works in server mode. In end-to-end mode the API takes a split
// account's salt only together with its keys (keys.controller keyFields), so a
// staff account can't be made here at all; the page says so and points to an
// invitation, which makes the account with its keys on the person's device.

type StaffRole = 'chapter' | 'admin'

interface Values {
  username: string
  email: string
  name: string
  role: StaffRole
  group: string
  password: string
  confirm: string
}

const EMPTY: Values = { username: '', email: '', name: '', role: 'chapter', group: '', password: '', confirm: '' }

/** What the API would refuse (README "User fields"), and what the clients agreed of a password, said before sending. */
function problems(v: Values): string[] {
  const out: string[] = []
  const username = v.username.trim()
  if (username && (username.length < 3 || username.length > 16)) out.push('A username is 3 to 16 characters.')
  if (/^(anon|writer)-/i.test(username)) out.push('Usernames starting “anon-” or “writer-” are kept for the writers groups look after.')
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) out.push('The email address doesn’t look right.')
  if (/@managed\.example$/i.test(v.email.trim())) out.push('@managed.example addresses are kept for the writers groups look after.')
  const name = v.name.trim()
  if (name && (name.length < 3 || name.length > 32)) out.push('A name is 3 to 32 characters, or left blank.')
  if (v.password && v.password.length < MIN_PASSWORD_LENGTH) out.push(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
  if (v.confirm && v.confirm !== v.password) out.push('The two passwords don’t match.')
  return out
}

const groupLabel = (g: Chapter) => `${g.name}${g.accountStatus !== 'active' ? ` (${g.accountStatus})` : ''}`

const ready = (v: Values) =>
  v.username.trim() !== '' && v.email.trim() !== '' && v.password !== '' && v.confirm === v.password && (v.role === 'admin' || v.group !== '')

export default function NewAccount() {
  const readiness = useApi(getEncryptionReadiness, [])
  const mode = readiness.data?.mode

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">
          <Link to="/admin/users">Accounts</Link> / New staff account
        </span>
      </div>

      <div className="admin-content">
        <p className="dash-note">
          The usual way to add a group admin is to <Link to="/admin/invite">invite them</Link>: they make the account themselves, with its keys, on their own
          device. Writers join with an invite code from a group.
        </p>
        {readiness.loading && <p className="dash-note">Checking how the site encrypts letters…</p>}
        {readiness.error && (
          <div className="admin-alert admin-alert-err">
            Couldn’t check how the site encrypts letters ({createRefusal(readiness.error)}), and a staff account can only be made here in server mode.{' '}
            <button type="button" className="a-btn a-btn-sm" onClick={readiness.reload}>
              Try again
            </button>
          </div>
        )}
        {mode === 'e2e' && (
          <div className="admin-alert admin-alert-warn">
            This site encrypts letters end to end, and then the API makes an account only together with its keys. Those must be made on the person’s own device
            (a site admin never holds anyone’s private key), so a staff account can’t be made here. <Link to="/admin/invite">Invite them</Link> as a group
            admin of their group instead. To make someone a site admin, change the role of their account once it exists.
          </div>
        )}
        {mode === 'server' && <AccountForm />}
      </div>
    </>
  )
}

function AccountForm() {
  const navigate = useNavigate()
  // The group found with the picker; `values.group` is its id.
  const [group, setGroup] = useState<Chapter | null>(null)
  const [values, setValues] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const issues = problems(values)
  const strength = passwordStrength(values.password)
  const set = (patch: Partial<Values>) => {
    setValues((v) => ({ ...v, ...patch }))
    setError(null)
  }
  const field = (key: Exclude<keyof Values, 'role'>) => ({
    id: `f-${key}`,
    value: values[key],
    disabled: busy,
    onChange: (e: { target: { value: string } }) => set({ [key]: e.target.value }),
  })

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const user = await createStaffAccount({
        username: values.username.trim(),
        email: values.email.trim(),
        name: values.name.trim() || undefined,
        role: values.role,
        chapterId: values.role === 'chapter' ? Number(values.group) : undefined,
        password: values.password,
      })
      navigate(`/admin/users/${user.id}`, { replace: true, state: { created: true } })
    } catch (err) {
      setError(createRefusal(err as ApiError))
      setBusy(false)
    }
  }

  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready(values) && issues.length === 0 && !busy) void save()
      }}
    >
      <Section title="Account">
        <div className="form-row">
          <Field label="Username" htmlFor="f-username" hint="3 to 16 characters. They sign in with it.">
            <input className="form-input" autoComplete="off" required {...field('username')} />
          </Field>
          <Field label="Email" htmlFor="f-email">
            <input type="email" className="form-input" autoComplete="off" required {...field('email')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Name" htmlFor="f-name" hint="Optional, 3 to 32 characters. Staff accounts sign no letters, so they need no pen name.">
            <input className="form-input" autoComplete="off" {...field('name')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Role" htmlFor="f-role">
            <select id="f-role" className="form-select" value={values.role} disabled={busy} onChange={(e) => set({ role: e.target.value as StaffRole })}>
              <option value="chapter">Group admin</option>
              <option value="admin">Site admin</option>
            </select>
          </Field>
          {values.role === 'chapter' && (
            <Field label="Group" htmlFor="f-group" hint="They read its letters once its group-owner admin hands them the group key.">
              <div className="relay-add" style={{ marginBottom: '0.4rem' }}>
                <span className="form-static">{group && values.group ? groupLabel(group) : 'None chosen yet'}</span>
              </div>
              <RecordPicker
                id="f-group"
                label="Group"
                classes={{ input: 'form-input' }}
                placeholder={values.group ? 'Search groups to change it…' : 'Search groups…'}
                disabled={busy}
                fetch={(q) => getGroups({ q, sort: 'name', page_size: PICKER_PAGE_SIZE })}
                exclude={values.group ? [Number(values.group)] : null}
                render={groupLabel}
                onSelect={(g) => {
                  setGroup(g)
                  set({ group: String(g.id) })
                }}
              />
            </Field>
          )}
        </div>
        {values.role === 'admin' && (
          <div className="admin-alert admin-alert-warn">A site admin runs the whole site: the directory, every group, every account. They hold no group key and can read no letter.</div>
        )}
      </Section>

      <Section title="First password">
        <p className="form-hint">
          Give this password to them once, in person or some other safe way, and nowhere else; they should change it after their first sign-in. It never leaves
          this browser: only a key derived from it is sent.
        </p>
        <div className="form-row">
          <Field label="Password" htmlFor="f-password" hint={strength?.label ?? `At least ${MIN_PASSWORD_LENGTH} characters.`}>
            <input type="password" className="form-input" autoComplete="new-password" required {...field('password')} />
          </Field>
          <Field label="Password again" htmlFor="f-confirm">
            <input type="password" className="form-input" autoComplete="new-password" required {...field('confirm')} />
          </Field>
        </div>
        <div className="admin-alert admin-alert-warn">
          The account has no keys until its first sign-in on the Android or iOS app, which makes them. Until then the web refuses it (every account here needs
          keys), so they sign in on a phone first. An <Link to="/admin/invite">invitation</Link> avoids this: the person makes the account with its keys
          wherever they accept it.
        </div>
      </Section>

      {issues.length > 0 && (
        <div className="admin-alert admin-alert-warn form-error">
          {issues.map((text) => (
            <div key={text}>{text}</div>
          ))}
        </div>
      )}
      {error && <div className="admin-alert admin-alert-err form-error">{error}</div>}

      <div className="admin-form-footer">
        <span />
        <div className="admin-form-footer-actions">
          <Link to="/admin/users" className="a-btn">
            Cancel
          </Link>
          <button type="submit" className="a-btn a-btn-primary" disabled={busy || !ready(values) || issues.length > 0}>
            {busy ? 'Making the account…' : 'Make the account'}
          </button>
        </div>
      </div>
    </form>
  )
}
