import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../api/client'
import { getMemberKeys, passOwnership } from '../../api/groups'
import { getUser } from '../../api/users'
import { useApi } from '../../hooks/useApi'
import type { Chapter, GroupMemberKeyState } from '../../types'
import { refusalText } from '../../utils/refusals'
import { accountName, ownerListStale, ownerRefusal } from '../../utils/users'
import { Section } from '../forms/AdminFormParts'

// A group's owner, for a site admin (README "Group keys" > "Ownership"): the
// one group admin who hands the group key on, takes it back and rotates it. A
// site admin may name another at any time (PUT /auth/chapter-owner), "the way
// out of a rogue or vanished owner" (issue #73); the owner's own control is on
// the group's keys page (pages/org/GroupKeys.tsx).
//
// Who can be chosen: the group's admins (GET /auth/member-keys, which a site
// admin may read: names and who holds the key, never the key). Once the group
// has a key, only those who hold it: an owner without it could do none of the
// three things an owner is for, and the API refuses (`409 OwnerError no_key`).
// The others are shown, and can't be chosen. Choosing gives nobody access to
// letters: that is the key's, and a site admin never holds or hands one.
//
// The page's record isn't reloaded after a change (that would drop unsaved
// edits to the form above): the roster is, and it says who the owner is.

interface Props {
  group: Pick<Chapter, 'id' | 'name' | 'ownerId'>
  /** The owner changed: the page's history should be read again. */
  onChanged: () => void
}

export default function GroupOwnerPanel({ group, onChanged }: Props) {
  const roster = useApi(() => getMemberKeys(group.id), [group.id], { keepPrevious: true })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The roster is the newer word on who owns the group; the record until it loads.
  const ownerId = roster.data ? roster.data.owner : group.ownerId
  const members = roster.data?.members ?? []
  const owner = members.find((m) => m.id === ownerId) ?? null
  // An owner who isn't one of the group's admins (any more) isn't on the roster: looked up for the name.
  const outside = useApi(() => (roster.data && ownerId !== null && !owner ? getUser(ownerId) : Promise.resolve(null)), [roster.data !== null, ownerId, owner !== null])

  const hasKey = Boolean(roster.data?.publicKey)
  const holders = members.filter((m) => m.holdsGroupKey)
  /** Nobody a site admin could name: the key exists, and none of the group's admins holds it. */
  const stranded = roster.data !== null && hasKey && ownerId === null && holders.length === 0

  async function choose(m: GroupMemberKeyState) {
    const name = accountName(m)
    const question = [
      `Make ${name} the group-owner admin of ${group.name}?`,
      owner ? `${accountName(owner)} stops being the owner.` : null,
      'The owner hands the group key to the other group admins, takes it back, and rotates it. This gives nobody access to letters they didn’t already have. Every group admin of the group is told.',
    ]
    if (!window.confirm(question.filter(Boolean).join(' '))) return
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      await passOwnership(group.id, m.id)
      setNotice(`${name} is the group-owner admin of ${group.name} now.`)
      onChanged()
      roster.reload()
    } catch (err) {
      const e = toApiError(err)
      setError(ownerRefusal(e, name))
      if (ownerListStale(e)) roster.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-form relay-panel">
      <Section title="Group-owner admin">
        <p className="form-hint">
          The one group admin who hands the group key to the others, takes it back, and rotates it. The first to set up the group’s key becomes its
          owner, and the owner can pass it on from the group’s keys page. A site admin can name another here at any time, for an owner who has gone
          or shouldn’t be one. This applies straight away, without Save.
        </p>

        {notice && <div className="admin-alert admin-alert-ok" role="status">{notice}</div>}
        {error && <div className="admin-alert admin-alert-err" role="alert">{error}</div>}

        <p className="form-static">
          <strong>Now: </strong>
          {ownerId === null && 'nobody.'}
          {owner && (
            <>
              <Link to={`/admin/users/${owner.id}`}>{accountName(owner)}</Link>
              {owner.name && <span className="list-sub"> ({owner.username})</span>}
            </>
          )}
          {ownerId !== null && !owner && !roster.data && 'loading…'}
          {ownerId !== null && !owner && roster.data && (
            <>
              <Link to={`/admin/users/${ownerId}`}>{outside.data ? accountName(outside.data) : `account #${ownerId}`}</Link>
              <span className="list-sub">
                {' '}
                {outside.error?.status === 404 ? '(an account that isn’t there any more)' : '(not one of this group’s admins any more)'}
              </span>
            </>
          )}
        </p>

        {roster.loading && <p className="form-static">Loading the group’s admins…</p>}
        {roster.error && (
          <div className="admin-alert admin-alert-err" role="alert">
            Couldn’t load the group’s admins ({refusalText(roster.error)}), so an owner can’t be chosen.{' '}
            <button type="button" className="a-btn a-btn-sm" onClick={roster.reload}>
              Try again
            </button>
          </div>
        )}

        {stranded && (
          <div className="admin-alert admin-alert-warn" role="status">
            {/* One child: the alert lays its children out in a row. */}
            <div>
              <p>
                <strong>This group can’t be given an owner from here.</strong> It has a key and no owner, and none of its group admins holds the key.
                Ownership only goes to a group admin who holds it, and only an owner can hand it on, so nobody new can be handed it either.
              </p>
              <p>If the person who held the key was since given another role or moved to another group, their copy of it is still there:</p>
              <ol>
                <li>On their account page, make them a group admin of {group.name} again. The history below names who held the key.</li>
                <li>Come back here and make them the owner.</li>
                <li>They sign in, hand the key to another group admin on the group’s keys page, and pass ownership on there.</li>
                <li>Change their role back.</li>
              </ol>
            </div>
          </div>
        )}

        {roster.data && members.length === 0 && !stranded && (
          <p className="form-static">
            This group has no group admins, so there is nobody to choose. <Link to="/admin/invite">Invite one</Link>, or make an account a group admin
            of it on the account’s page.
          </p>
        )}

        {roster.data && members.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Group admin</th>
                  <th>Group key</th>
                  <th>
                    <span className="visually-hidden">Make owner</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isOwner = m.id === ownerId
                  const eligible = !hasKey || m.holdsGroupKey
                  return (
                    <tr key={m.id}>
                      <td>
                        <Link to={`/admin/users/${m.id}`}>{accountName(m)}</Link>
                        {m.name && <span className="list-sub"> ({m.username})</span>}
                      </td>
                      <td>{!hasKey ? 'The group has no key yet' : m.holdsGroupKey ? 'Holds the group key' : 'Doesn’t hold the group key yet'}</td>
                      <td>
                        {isOwner ? (
                          <span className="badge badge-published">Group-owner admin</span>
                        ) : eligible ? (
                          <button type="button" className="a-btn a-btn-sm" disabled={busy} onClick={() => void choose(m)}>
                            Make owner
                          </button>
                        ) : (
                          <span className="list-sub">Can’t be the owner until the owner hands them the key</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
