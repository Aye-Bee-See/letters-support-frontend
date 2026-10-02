import { Link, useMatch } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// .admin-edit-bar from solidarity-site/prisoner-profile.html (and facility and
// group profiles): shown above the header to superadmins on a directory record.
export default function AdminBar() {
  const { isAdmin } = useAuth()
  const prisoner = useMatch('/prisoners/:id')
  const facility = useMatch('/facilities/:id')
  const group = useMatch('/groups/:id')

  if (!isAdmin) return null
  // Groups have a list page only in the admin area so far.
  const edit = prisoner
    ? `/admin/prisoners/${prisoner.params.id}/edit`
    : facility
      ? `/admin/facilities/${facility.params.id}/edit`
      : group
        ? '/admin/groups'
        : null
  if (!edit) return null

  return (
    <div className="admin-edit-bar">
      <div className="wrap">
        <Link to="/admin">← Dashboard</Link>
        <Link to={edit}>Edit this record</Link>
      </div>
    </div>
  )
}
