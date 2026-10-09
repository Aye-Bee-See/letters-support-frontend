import { Link } from 'react-router-dom'
import { getAllGroups } from '../../api/groups'
import { getUsers, type UserListParams } from '../../api/users'
import ListPager from '../../components/ui/ListPager'
import { useApi } from '../../hooks/useApi'
import { useListParams, useSearchBox } from '../../hooks/useListParams'
import type { Chapter, User } from '../../types'
import { shortDate } from '../../utils/prisoners'
import { isRole, ROLE_LABELS, ROLES } from '../../utils/users'

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
  const q = params.get('q') ?? ''
  const roleParam = params.get('role')
  const role = isRole(roleParam) ? roleParam : undefined

  const query: UserListParams = { q: q || undefined, role, page, page_size: PAGE_SIZE }
  const list = useApi(() => getUsers(query), [q, role, page], { keepPrevious: true })
  // The few groups there are, once, to name each group admin's.
  const groups = useApi(() => getAllGroups({ sort: 'name' }), [])

  const [search, setSearch] = useSearchBox(q, (value) => update({ q: value }))

  const filtered = Boolean(q || role)
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Accounts</span>
        <span className="topbar-right">{list.data && `${total} ${filtered ? 'matching' : 'in all'}`}</span>
      </div>

      <div className="admin-content">
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
              Couldn't load the accounts ({list.error.message}).{' '}
              <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
                Try again
              </button>
            </p>
          )}
          {list.data && list.data.total === 0 && <p className="dash-note">{filtered ? 'No accounts match.' : 'There are no accounts yet.'}</p>}
          {list.data && list.data.items.length > 0 && <UserTable users={list.data.items} groups={groups.data} />}
        </div>

        {list.data && <ListPager page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />}
      </div>
    </>
  )
}

function UserTable({ users, groups }: { users: User[]; groups: Chapter[] | null }) {
  const groupName = (id: number) => groups?.find((g) => g.id === id)?.name ?? `Group #${id}`
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
