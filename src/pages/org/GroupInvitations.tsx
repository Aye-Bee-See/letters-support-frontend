import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getGroupsByIds } from '../../api/groups'
import { getInvitations } from '../../api/invitations'
import { GROUP_PAGER, GROUP_UI } from '../../components/forms/uiClasses'
import InvitationTable from '../../components/invitations/InvitationTable'
import InviteForm from '../../components/invitations/InviteForm'
import TokenNotice from '../../components/invitations/TokenNotice'
import Pager from '../../components/ui/Pager'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { GROUP_KIND_LABELS } from '../../components/invitations/wording'
import { useApi } from '../../hooks/useApi'
import { useGatedGroup } from '../../hooks/useGroup'
import { useListParams } from '../../hooks/useListParams'
import type { Chapter, Invitation, InvitationKind } from '../../types'
import { refusalText } from '../../utils/refusals'

// A group's own invitations (README "Invitations"): a new group admin of this
// group (kind `member`), or a new group this group vouches for (kind `group`).
// The API uses the caller's own group for both, and lists only its
// invitations. The token is shown once, in the answer to create or renew, and
// the API never sends it: the group admin hands it over.
//
// The form, the token notice and the table are shared with the site admin's
// page (admin/Invitations.tsx) through components/invitations, with GROUP_UI's
// classes (pages/org-settings.css): admin.css isn't loaded here.

const PAGE_SIZE = 25

export default function GroupInvitations() {
  const { group } = useGatedGroup()
  const { params, page, update } = useListParams()
  const kindParam = params.get('kind')
  const kind: InvitationKind | undefined = kindParam === 'member' || kindParam === 'group' ? kindParam : undefined

  const list = useApi(() => getInvitations({ kind, page, page_size: PAGE_SIZE }), [kind, page])
  // For the names of groups this group vouched for once they joined: only the
  // ones this page of invitations names, fetched by id. Groups still waiting
  // for approval aren't public, and show as "group #id".
  const named = [...new Set((list.data?.items ?? []).flatMap((i) => [i.createdChapter, i.chapterId]))]
    .filter((n): n is number => n !== null && n !== group.id)
    .sort((a, b) => a - b)
  const groups = useApi(() => (named.length ? getGroupsByIds(named) : Promise.resolve(new Map<number, Chapter>())), [named.join(',')])
  const groupById = useMemo(() => {
    const map = new Map(groups.data ?? [])
    map.set(group.id, group)
    return map
  }, [groups.data, group])
  // The token to hand over, after a create or renew: shown until dismissed.
  const [issued, setIssued] = useState<{ invitation: Invitation; renewed: boolean } | null>(null)
  // Leaving loses the code on screen for good: ask first, for an in-app link as for closing the tab.
  useLeaveGuard(issued !== null, 'The invitation code on this page is shown only now. Leave without copying it?', { back: true })

  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="settings-wrap">
      <title>Invitations · letters.support</title>
      <div className="settings-inner settings-inner-wide">
        <Link to="/settings" className="settings-back">
          ← Group settings
        </Link>
        <h1 className="settings-title">Invitations</h1>
        <p className="settings-subtitle">
          Bring a new group admin into {group.name}, or vouch for a new group joining the network. Each invitation is a code you hand over yourself:
          nothing is sent by email.
        </p>

        {/* Keyed by the code (a renewal keeps the id), so a new one starts with nothing copied. */}
        {issued && <TokenNotice key={`${issued.invitation.id}:${issued.invitation.token}`} classes={GROUP_UI} {...issued} group={group} onDone={() => setIssued(null)} />}

        <InviteForm
          classes={GROUP_UI}
          ownGroup={group}
          onCreated={(invitation) => {
            setIssued({ invitation, renewed: false })
            list.reload()
          }}
          codeOnScreen={issued !== null}
        />

        <section className="settings-section">
          <h2 className="settings-section-heading">Invitations sent</h2>
          <div className="settings-add-row settings-filters">
            <label className="visually-hidden" htmlFor="invitation-kind">
              Kind
            </label>
            <select className="settings-input" id="invitation-kind" value={kind ?? ''} onChange={(e) => update({ kind: e.target.value || undefined })}>
              <option value="">Group admins and new groups</option>
              <option value="member">New group admins</option>
              <option value="group">New groups we vouched for</option>
            </select>
          </div>
          {list.loading && <p className="settings-static">Loading invitations…</p>}
          {list.error && (
            <div className="settings-alert settings-alert-err">
              Couldn’t load your group’s invitations ({refusalText(list.error)}).{' '}
              <button type="button" className="settings-link-button" onClick={list.reload}>
                Try again
              </button>
            </div>
          )}
          {list.data && list.data.total === 0 && <p className="settings-static">{kind ? 'No invitations of this kind.' : 'No invitations yet.'}</p>}
          {list.data && list.data.items.length > 0 && (
            <div className="settings-table-wrap">
              <InvitationTable
                classes={GROUP_UI}
                invitations={list.data.items}
                groupById={groupById}
                kindLabels={GROUP_KIND_LABELS}
                groupHref={(id) => `/groups/${id}`}
                onRenewed={(invitation) => {
                  setIssued({ invitation, renewed: true })
                  list.reload()
                }}
                onChanged={list.reload}
                codeOnScreen={issued !== null}
              />
            </div>
          )}
          {list.data && <Pager classes={GROUP_PAGER} page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />}
          <p className="settings-hint settings-footnote">
            A code works until the date shown. Renew gives a new code and stops the old one; Withdraw stops it for good. Your email and note are for your
            group only: the person invited never sees them.
          </p>
        </section>
      </div>
    </div>
  )
}
