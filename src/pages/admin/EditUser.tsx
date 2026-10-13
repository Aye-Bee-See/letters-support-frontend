import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { getGroups, getGroupsByIds } from '../../api/groups'
import { resetTwoFactor } from '../../api/twoFactor'
import { deleteUser, getUser, revokeSessions, setUserGroup, setUserRole } from '../../api/users'
import { Field, Section } from '../../components/forms/AdminFormParts'
import RecordPicker from '../../components/forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../../components/forms/recordPickerState'
import { useLinkAction } from '../../components/group/useLinkAction'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { ApiError, Chapter, User, UserRole } from '../../types'
import { shortDate } from '../../utils/prisoners'
import { accountName, accountRefusal, deleteRefusal, managedNote, ROLE_LABELS, ROLES } from '../../utils/users'

// One account, for a site admin (README "Users"): its record, and what a site
// admin may do to it. Each action applies at once, after a confirmation, and
// words its refusal from `name` and `condition` (utils/users.ts):
//   - change the role (PUT /auth/user { role }); `banned` is the direct ban,
//     which ends every session at once;
//   - put a group admin in a group or take them out (PUT /auth/user { chapterId });
//   - end every session (POST /auth/revoke), without banning;
//   - reset two-factor sign-in, for a lost phone (DELETE /auth/two-factor/user);
//   - delete the account and everything written or received through it
//     (DELETE /auth/user), confirmed by typing the username.
// An account record holds no letters, and nothing here reads one. Your own
// account isn't changed here: a role change or a revocation would end the
// session you are using.

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Keyed on the id, so nothing said about one account stays on screen for the next. */
export default function EditUserPage() {
  const { id } = useParams()
  return <EditUser key={id} id={Number(id)} />
}

function EditUser({ id }: { id: number }) {
  const location = useLocation()
  const created = (location.state as { created?: boolean } | null)?.created === true
  const user = useApi(() => getUser(id), [id], { keepPrevious: true })
  // The groups the account names (its own, the one that looked after it, the
  // one it was claimed from), fetched by id for their names.
  const named = [user.data?.chapterId, user.data?.managedBy, user.data?.claimedFrom].filter((g): g is number => typeof g === 'number')
  const found = useApi(() => (named.length ? getGroupsByIds(named) : Promise.resolve(new Map<number, Chapter>())), [named.join(',')], { keepPrevious: true })
  const groups = found.data ? [...found.data.values()] : null
  const { user: me } = useAuth()
  const [notice, setNotice] = useState<string | null>(created ? 'Account made.' : null)

  const done = (text: string) => {
    setNotice(text)
    user.reload()
  }

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">
          <Link to="/admin/users">Accounts</Link> / {user.data?.username ?? `Account #${id}`}
        </span>
        <span className="topbar-right">
          <Link to={`/admin/audit?resource=user&target=${id}`}>Audit log entries</Link>
        </span>
      </div>

      <div className="admin-content">
        {user.loading && !user.data && <p className="dash-note">Loading the account…</p>}
        {user.error && (
          <div className="admin-alert admin-alert-err">
            {user.error.status === 404
              ? `There is no account #${id}. It may have been deleted: the audit log keeps an account’s number, never its name.`
              : `Couldn't load account #${id} (${accountRefusal(user.error)}).`}
            {user.error.status !== 404 && (
              <button type="button" className="a-btn a-btn-sm" onClick={user.reload}>
                Try again
              </button>
            )}
          </div>
        )}
        {notice && (
          <div className="admin-alert admin-alert-ok" role="status">
            {notice}
          </div>
        )}
        {user.data && (
          <>
            <AccountRecord u={user.data} groups={groups} />
            {me?.id === user.data.id ? (
              <div className="admin-alert admin-alert-warn">
                This is your own account. Its role, sessions and deletion are another site admin’s to change; your password and two-factor sign-in are on{' '}
                <Link to="/account/security">your account’s security page</Link>.
              </div>
            ) : (
              <Actions key={`${user.data.id}-${user.data.updatedAt}`} u={user.data} groups={groups} onDone={done} onEdit={() => setNotice(null)} />
            )}
          </>
        )}
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="form-group">
      <span className="form-label">{label}</span>
      <div className="form-static">{children}</div>
    </div>
  )
}

const groupLink = (groupId: number, groups: Chapter[] | null) => (
  <Link to={`/admin/groups/${groupId}/edit`}>{groups?.find((g) => g.id === groupId)?.name ?? `Group #${groupId}`}</Link>
)

function AccountRecord({ u, groups }: { u: User; groups: Chapter[] | null }) {
  const managed = managedNote(u)
  return (
    <div className="admin-form">
      <Section title="Account">
        <p className="form-hint">An account holds no letters: nothing on this page reads one, and nothing here opens them.</p>
        {managed && <div className="admin-alert admin-alert-warn">{managed}</div>}
        <div className="form-row">
          <Row label="Username">{u.username}</Row>
          <Row label="Email">{u.email}</Row>
        </div>
        <div className="form-row">
          <Row label="Name">{u.name ?? '—'}</Row>
          <Row label="Pen name">{u.penName ?? '—'}</Row>
        </div>
        <div className="form-row">
          <Row label="Role">{u.role === 'banned' ? <span className="badge badge-pending">banned</span> : capitalise(ROLE_LABELS[u.role])}</Row>
          <Row label="Group">
            {u.chapterId !== null ? groupLink(u.chapterId, groups) : '—'}
            {u.chapterId !== null && u.role !== 'chapter' && <span className="list-sub"> (only a group admin acts for a group)</span>}
          </Row>
        </div>
        <div className="form-row">
          <Row label="Keys">
            {u.publicKey ? 'Set' : 'None yet'}
            {!u.publicKey && managed === null && (
              <div className="list-sub">The web refuses an account without keys; its first sign-in on a phone app makes them.</div>
            )}
          </Row>
          <Row label="Made">{shortDate(u.createdAt)}</Row>
        </div>
        {(u.managedBy !== null || u.claimedFrom !== null) && (
          <div className="form-row">
            {u.managedBy !== null && <Row label="Looked after by">{groupLink(u.managedBy, groups)}</Row>}
            {u.claimedFrom !== null && (
              <Row label="Claimed">
                {shortDate(u.claimedAt)}, from {groupLink(u.claimedFrom, groups)}
              </Row>
            )}
          </div>
        )}
      </Section>
    </div>
  )
}

interface ActionsProps {
  u: User
  groups: Chapter[] | null
  onDone: (notice: string) => void
  onEdit: () => void
}

function Actions({ u, groups, onDone, onEdit }: ActionsProps) {
  const navigate = useNavigate()
  const { busy, error, run } = useLinkAction(accountRefusal)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [role, setRole] = useState<UserRole>(u.role)
  const [roleGroup, setRoleGroup] = useState(u.chapterId !== null ? String(u.chapterId) : '')
  // Groups found with the pickers, for naming them.
  const [picked, setPicked] = useState<Chapter[]>([])

  const name = accountName(u)
  const managed = managedNote(u) !== null
  const groupName = (groupId: number) => [...picked, ...(groups ?? [])].find((g) => g.id === groupId)?.name ?? `group #${groupId}`
  const groupPicker = (inputId: string | undefined, label: string, placeholder: string, exclude: number | null, onSelect: (g: Chapter) => void) => (
    <RecordPicker
      id={inputId}
      label={label}
      classes={{ input: 'form-input' }}
      placeholder={placeholder}
      disabled={busy}
      fetch={(q) => getGroups({ q, sort: 'name', page_size: PICKER_PAGE_SIZE })}
      exclude={exclude !== null ? [exclude] : null}
      render={(g) => `${g.name}${g.accountStatus !== 'active' ? ` (${g.accountStatus})` : ''}`}
      onSelect={(g) => {
        setPicked((list) => [g, ...list])
        onSelect(g)
      }}
    />
  )

  const act = (question: string, action: () => Promise<string>) => {
    if (!window.confirm(question)) return
    onEdit()
    setDeleteError(null)
    void run(async () => onDone(await action()))
  }

  // --- Role -------------------------------------------------------------------
  const toGroup = role === 'chapter' ? Number(roleGroup) || null : null
  const roleChanged = role !== u.role || (role === 'chapter' && toGroup !== u.chapterId)
  const leavingGroupAdmin = u.role === 'chapter' && role !== 'chapter'

  function changeRole() {
    const parts = [
      role === 'banned'
        ? `Ban ${name}?`
        : role === 'chapter' && toGroup !== null
          ? `Make ${name} a group admin of ${groupName(toGroup)}?`
          : `Make ${name} a ${ROLE_LABELS[role]}?`,
    ]
    if (role === 'banned') parts.push('Every session of the account ends at once, and it can’t sign in until its role is changed back. Nothing is deleted.')
    if (role === 'admin') parts.push('A site admin runs the whole site: the directory, every group, every account, the audit log.')
    if (role === 'chapter' && toGroup !== null)
      parts.push(`They act for ${groupName(toGroup)} from their next request, and read its letters once its owner hands them the group key.`)
    if (leavingGroupAdmin && u.chapterId !== null)
      parts.push(`They stop acting for ${groupName(u.chapterId)}. If they are its group-owner admin, it has no owner until another is chosen, and it is told.`)
    act(parts.join('\n\n'), async () => {
      await setUserRole(u.id, role, role === 'chapter' && toGroup !== u.chapterId ? toGroup : undefined)
      return role === 'banned' ? `${name} is banned: every session has ended.` : `${name} is now ${role === 'chapter' ? `a group admin of ${groupName(toGroup!)}` : `a ${ROLE_LABELS[role]}`}.`
    })
  }

  // --- Group ------------------------------------------------------------------
  function changeGroup(to: Chapter | null) {
    const question =
      to === null
        ? `Take ${name} out of ${groupName(u.chapterId!)}? They stop acting for it at once. If they are its group-owner admin, it has no owner until another is chosen, and it is told.`
        : u.chapterId === null
          ? `Put ${name} in ${to.name}? They act for it from their next request, and read its letters once its owner hands them the group key.`
          : `Move ${name} from ${groupName(u.chapterId)} to ${to.name}? They stop acting for ${groupName(u.chapterId)} at once, and read ${to.name}’s letters once its owner hands them its key.`
    act(question, async () => {
      await setUserGroup(u.id, to?.id ?? null)
      return to === null ? `${name} is in no group now.` : `${name} is in ${to.name} now.`
    })
  }

  // --- Delete -----------------------------------------------------------------
  async function remove() {
    const typed = window.prompt(
      `Deleting ${u.username} can’t be undone. It deletes the account and everything written or received through it: every letter, whether queued, printed or mailed, every reply recorded for them, their attachments and their threads. The username and email are free again at once.\n\nBanning keeps everything and stops them signing in; it is usually what’s wanted.\n\nTo delete the account anyway, type its username:`,
    )
    if (typed === null) return
    if (typed.trim() !== u.username) {
      setDeleteError('The username didn’t match, so nothing was deleted.')
      return
    }
    onEdit()
    setDeleteError(null)
    void run(async () => {
      try {
        const report = await deleteUser(u.id)
        navigate('/admin/users', { replace: true, state: { deleted: { username: u.username, ...report } } })
      } catch (err) {
        // Worded here: the delete refusals have conditions of their own.
        setDeleteError(deleteRefusal(err as ApiError))
      }
    })
  }

  return (
    <>
      {!managed && (
        <div className="admin-form relay-panel">
          <Section title="Role">
            <div className="form-row">
              <Field label="Role" htmlFor="f-role">
                <select id="f-role" className="form-select" value={role} disabled={busy} onChange={(e) => setRole(e.target.value as UserRole)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {capitalise(ROLE_LABELS[r])}
                    </option>
                  ))}
                </select>
              </Field>
              {role === 'chapter' && (
                <Field label="Group" htmlFor="f-role-group" hint="A group admin acts for one group.">
                  <div className="relay-add" style={{ marginBottom: '0.4rem' }}>
                    <span className="form-static">{toGroup !== null ? groupName(toGroup) : 'None chosen yet'}</span>
                  </div>
                  {groupPicker('f-role-group', 'Group', toGroup !== null ? 'Search groups to change it…' : 'Search groups…', toGroup, (g) => setRoleGroup(String(g.id)))}
                </Field>
              )}
            </div>
            {role === 'banned' && u.role !== 'banned' && (
              <div className="admin-alert admin-alert-warn">
                Banning ends every session of this account at once, on every device, and it can’t sign in again until its role is changed back. Nothing is deleted.
                Groups’ recommendations to block this writer, if there are any, stay waiting on <Link to="/admin/bans">Block recommendations</Link>.
              </div>
            )}
            {role === 'admin' && u.role !== 'admin' && (
              <div className="admin-alert admin-alert-warn">A site admin runs the whole site. They still hold no group key and can read no letter.</div>
            )}
            <div className="relay-add">
              <button
                type="button"
                className={`a-btn a-btn-sm ${role === 'banned' ? 'a-btn-danger' : 'a-btn-primary'}`}
                disabled={busy || !roleChanged || (role === 'chapter' && toGroup === null)}
                onClick={changeRole}
              >
                {role === 'banned' && u.role !== 'banned' ? 'Ban' : 'Change role'}
              </button>
            </div>
          </Section>
        </div>
      )}

      {!managed && (u.role === 'chapter' || u.chapterId !== null) && (
        <div className="admin-form relay-panel">
          <Section title="Group">
            <p className="form-hint">
              {u.chapterId !== null ? <>In {groupLink(u.chapterId, groups)}.</> : 'In no group: a group admin without a group can read what anyone can, and nothing else.'}{' '}
              A group admin reads their group’s letters only once its group-owner admin hands them the group key.
            </p>
            <div className="relay-add">
              {groupPicker(
                undefined,
                u.chapterId !== null ? 'Group to move to' : 'Group to put them in',
                u.chapterId !== null ? 'Search groups to move them to…' : 'Search groups to put them in…',
                u.chapterId,
                (g) => changeGroup(g),
              )}
              {u.chapterId !== null && (
                <button type="button" className="a-btn a-btn-danger a-btn-sm" disabled={busy} onClick={() => changeGroup(null)}>
                  Take out of the group
                </button>
              )}
            </div>
          </Section>
        </div>
      )}

      {!managed && (
        <div className="admin-form relay-panel">
          <Section title="Sessions and two-factor sign-in">
            <p className="form-hint">
              Sign out everywhere ends every session of this account on every device at once, without banning it: they can sign in again straight away. For a
              lost phone or a shared computer.
            </p>
            <div className="relay-add">
              <button
                type="button"
                className="a-btn a-btn-sm"
                disabled={busy}
                onClick={() =>
                  act(`End every session of ${name}, on every device? They can sign in again straight away.`, async () => {
                    await revokeSessions(u.id)
                    return `Every session of ${name} has ended. They can sign in again with their password.`
                  })
                }
              >
                Sign out everywhere
              </button>
            </div>
            <p className="form-hint">
              Reset two-factor sign-in only for someone who has lost their phone and their recovery codes, once you are sure it is them: it switches it off, and
              their recovery codes stop working. They sign in with their password, and set it up again if it is required of them.
            </p>
            <div className="relay-add">
              <button
                type="button"
                className="a-btn a-btn-danger a-btn-sm"
                disabled={busy}
                onClick={() =>
                  act(
                    `Reset two-factor sign-in for ${name}? It is switched off and their recovery codes stop working: anyone with their password can then sign in. Do this only once you are sure it is them.`,
                    async () => {
                      await resetTwoFactor(u.id)
                      return `Two-factor sign-in is off for ${name}. They sign in with their password, and set it up again if it is required of them.`
                    },
                  )
                }
              >
                Reset two-factor sign-in
              </button>
            </div>
          </Section>
        </div>
      )}

      {error && <div className="admin-alert admin-alert-err">{error}</div>}

      {u.anonymousForChapter === null && (
        <div className="admin-form relay-panel">
          <Section title="Delete the account">
            <p className="form-hint">
              Deletes the account and everything written or received through it, letters and replies included. It can’t be undone. What they did as staff stays,
              without their name.
            </p>
            {deleteError && <div className="admin-alert admin-alert-err">{deleteError}</div>}
            <div className="relay-add">
              <button type="button" className="a-btn a-btn-danger a-btn-sm" disabled={busy} onClick={() => void remove()}>
                Delete account…
              </button>
            </div>
          </Section>
        </div>
      )}
    </>
  )
}
