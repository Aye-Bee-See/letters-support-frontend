import { Link, useLocation } from 'react-router-dom'
import { getGroupsByIds } from '../../api/groups'
import { getUsers, type DeletedAccount, type UserListParams } from '../../api/users'
import ListPager from '../../components/ui/ListPager'
import { useApi } from '../../hooks/useApi'
import { useListParams, useSearchBox } from '../../hooks/useListParams'
import type { Chapter, User } from '../../types'
import { shortDate } from '../../utils/prisoners'
import { isRole, ROLE_LABELS, ROLES } from '../../utils/users'
import { refusalText } from '../../utils/refusals'

// Every account (GET /auth/users, superadmins only), oldest first, as the API
// lists them. `q` searches username, email and name; `role` narrows to one
// role. Both live in the URL under the API's names, with the page. An account
// record holds no letters: nothing on these pages can read one.
//
// Whether an account has two-factor sign-in on isn't in the record (the API
// sends no two-factor column to anyone), so it isn't shown.

const PAGE_SIZE = 25

export default function Users() {
  const { params, page, update, clear } = useListParams()
  // Set by the account page after a delete.
  const deleted = (useLocation().state as { deleted?: DeletedAccount & { username: string } } | null)?.deleted
  const q = params.get('q') ?? ''
  const roleParam = params.get('role')
  const role = isRole(roleParam) ? roleParam : undefined

  const query: UserListParams = { q: q || undefined, role, page, page_size: PAGE_SIZE }
  const list = useApi(() => getUsers(query), [q, role, page], { keepPrevious: true })
  // The groups this page of accounts names (each group admin's, and the one
  // looking after each managed writer), fetched by id for their names.
  const named = [...new Set((list.data?.items ?? []).flatMap((u) => [u.chapterId, u.managedBy]).filter((g): g is number => g !== null))].sort((a, b) => a - b)
  const found = useApi(() => (named.length ? getGroupsByIds(named) : Promise.resolve(new Map<number, Chapter>())), [named.join(',')], { keepPrevious: true })

  const [search, setSearch] = useSearchBox(q, (value) => update({ q: value }))

  const filtered = Boolean(q || role)
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Accounts</span>
        <span className="topbar-right">
          {list.data && `${total} ${filtered ? 'matching' : 'in all'}`}{' '}
          <Link to="/admin/users/new" className="a-btn a-btn-primary a-btn-sm">
            New account
          </Link>
        </span>
      </div>

      <div className="admin-content">
        {deleted && (
          <div className="admin-alert admin-alert-ok" role="status">
            {deleted.username} is deleted, with {deleted.letters} {deleted.letters === 1 ? 'letter' : 'letters'}, {deleted.replies}{' '}
            {deleted.replies === 1 ? 'reply' : 'replies'} and {deleted.threads} {deleted.threads === 1 ? 'thread' : 'threads'}.
          </div>
        )}
        <p className="dash-note">
          Writers, group admins and site admins. An account holds no letters: nothing here can read one, and changing an account never opens its letters.
        </p>

        <div className="admin-table-toolbar list-toolbar">
          <input
            type="search"
            className="admin-search"
            placeholder="Search by username, email or name"
            aria-label="Search by username, email or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="form-select" aria-label="Role" value={role ?? ''} onChange={(e) => update({ role: e.target.value || undefined })}>
            <option value="">Any role</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r].charAt(0).toUpperCase() + ROLE_LABELS[r].slice(1)}
              </option>
            ))}
          </select>
          {filtered && (
            <button
              type="button"
              className="a-btn a-btn-sm"
              onClick={() => {
                setSearch('')
                clear()
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="admin-table-wrap">
          {list.loading && !list.data && <p className="dash-note">Loading accounts…</p>}
          {list.error && (
            <p className="dash-note">
              Couldn't load the accounts ({refusalText(list.error)}).{' '}
              <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
                Try again
              </button>
            </p>
          )}
          {list.data && list.data.total === 0 && <p className="dash-note">{filtered ? 'No accounts match.' : 'There are no accounts yet.'}</p>}
          {list.data && list.data.items.length > 0 && <UserTable users={list.data.items} groups={found.data} />}
        </div>

        {list.data && <ListPager page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />}
      </div>
    </>
  )
}

function UserTable({ users, groups }: { users: User[]; groups: Map<number, Chapter> | null }) {
  const groupName = (id: number) => groups?.get(id)?.name ?? `Group #${id}`
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Name</th>
          <th>Pen name</th>
          <th>Role</th>
          <th>Group</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td>
              <Link to={`/admin/users/${u.id}`} className="list-name">
                {u.username}
              </Link>
              <div className="list-sub">{u.email}</div>
            </td>
            <td>{u.name ?? <span className="list-sub">—</span>}</td>
            <td>{u.penName ?? <span className="list-sub">—</span>}</td>
            <td>
              {u.role === 'banned' ? <span className="badge badge-pending">banned</span> : ROLE_LABELS[u.role]}
              {u.managedBy !== null && !u.claimedAt && <div className="list-sub">{u.anonymousForChapter !== null ? 'group’s anonymous account' : 'managed by a group'}</div>}
            </td>
            <td>
              {u.chapterId !== null ? (
                <Link to={`/admin/groups/${u.chapterId}/edit`}>{groupName(u.chapterId)}</Link>
              ) : u.managedBy !== null ? (
                <Link to={`/admin/groups/${u.managedBy}/edit`} className="list-sub">
                  {groupName(u.managedBy)}
                </Link>
              ) : (
                <span className="list-sub">—</span>
              )}
            </td>
            <td className="dash-nowrap">{shortDate(u.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
