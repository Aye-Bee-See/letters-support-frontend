import { useMemo, useState } from 'react'
import { getAllGroups } from '../../api/groups'
import { getInvitations } from '../../api/invitations'
import { ADMIN_UI } from '../../components/forms/uiClasses'
import InvitationTable from '../../components/invitations/InvitationTable'
import InviteForm from '../../components/invitations/InviteForm'
import TokenNotice from '../../components/invitations/TokenNotice'
import { ADMIN_KIND_LABELS } from '../../components/invitations/wording'
import ListPager from '../../components/ui/ListPager'
import { useApi } from '../../hooks/useApi'
import { useListParams } from '../../hooks/useListParams'
import type { Invitation, InvitationStatus } from '../../types'

// Inviting groups (and members of groups) into the network: POST, GET, PUT
// (renew) and DELETE (withdraw) /invitation. Groups aren't registered; a group
// that joins is vouched for by the group named here, or by nobody when a
// superadmin invites it directly. The token appears once, in the answer to
// create or renew. The API never sends it: the admin hands it over.
//
// The invitee accepts it at /invitation (pages/auth/AcceptInvitation.tsx), or in the Android or iOS app.
//
// The form, the token notice and the table are in components/invitations,
// shared with a group admin's own page (org/GroupInvitations.tsx).

const PAGE_SIZE = 25
const STATUSES: InvitationStatus[] = ['pending', 'accepted', 'revoked']

const oneOf = <T extends string>(values: readonly T[], v: string | null): T | undefined =>
  values.includes(v as T) ? (v as T) : undefined

export default function Invitations() {
  const { params, page, update } = useListParams()
  const status = oneOf(STATUSES, params.get('status'))
  const kind = oneOf(['group', 'member'] as const, params.get('kind'))

  const list = useApi(() => getInvitations({ status, kind, page, page_size: PAGE_SIZE }), [status, kind, page])
  const groups = useApi(() => getAllGroups({ sort: 'name' }), [])
  const groupById = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g])), [groups.data])
  // The token to hand over, after a create or renew: shown until dismissed.
  const [issued, setIssued] = useState<{ invitation: Invitation; renewed: boolean } | null>(null)

  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Invitations</span>
      </div>

      <div className="admin-content">
        {issued && <TokenNotice classes={ADMIN_UI} {...issued} group={issued.invitation.chapterId ? groupById.get(issued.invitation.chapterId) : undefined} onDone={() => setIssued(null)} />}

        <InviteForm
          classes={ADMIN_UI}
          groups={groups.data}
          groupsError={groups.error}
          onRetryGroups={groups.reload}
          onCreated={(invitation) => {
            setIssued({ invitation, renewed: false })
            list.reload()
          }}
        />

        <div className="admin-table-toolbar list-toolbar invite-list-toolbar">
          <span className="admin-table-toolbar-title">Invitations sent</span>
          <select className="form-select" aria-label="Status" value={status ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'pending' ? 'Pending (including expired)' : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select className="form-select" aria-label="Kind" value={kind ?? ''} onChange={(e) => update({ kind: e.target.value || undefined })}>
            <option value="">Groups and members</option>
            <option value="group">New groups</option>
            <option value="member">Group members</option>
          </select>
        </div>
        <div className="admin-table-wrap">
          {list.loading && <p className="dash-note">Loading invitations…</p>}
          {list.error && (
            <p className="dash-note">
              Couldn't load invitations ({list.error.message}).{' '}
              <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
                Try again
              </button>
            </p>
          )}
          {list.data && list.data.total === 0 && <p className="dash-note">{status || kind ? 'No invitations match.' : 'No invitations yet.'}</p>}
          {list.data && list.data.items.length > 0 && (
            <InvitationTable
              classes={ADMIN_UI}
              invitations={list.data.items}
              groupById={groupById}
              kindLabels={ADMIN_KIND_LABELS}
              groupHref={(id) => `/admin/groups/${id}/edit`}
              onRenewed={(invitation) => {
                setIssued({ invitation, renewed: true })
                list.reload()
              }}
              onChanged={list.reload}
            />
          )}
        </div>
        {list.data && <ListPager page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />}
      </div>
    </>
  )
}
