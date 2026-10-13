import { Link, useSearchParams } from 'react-router-dom'
import GroupActivity from '../../components/group/GroupActivity'
import GroupConversations from '../../components/group/GroupConversations'
import GroupWriters from '../../components/group/GroupWriters'
import MembersWaitingNotice from '../../components/group/MembersWaitingNotice'
import PrintQueue from '../../components/group/PrintQueue'
import AppShell from '../../components/layout/AppShell'
import { useAuth } from '../../hooks/useAuth'
import { useGatedGroup } from '../../hooks/useGroup'
import { useSignOut } from '../../hooks/useSignOut'

// The group admin's inbox, from the prototype's
// inbox-org.html (inbox.css): three tabs as the apps have them, To print,
// Conversations and Writers, with the group's recent activity in the sidebar.
// GroupGate, around this page, has already turned away a group that isn't
// active and says when this admin doesn't hold the group key; the tabs only say
// what that means where the letters would be. Superadmins never get here
// (/inbox sends them to /admin).

type Tab = 'print' | 'conversations' | 'writers'

const TABS: { key: Tab; label: string }[] = [
  { key: 'print', label: 'To print' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'writers', label: 'Writers' },
]

export default function InboxOrg() {
  const { user } = useAuth()
  const group = useGatedGroup()
  const signOut = useSignOut()
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'print'
  const chapterId = group.chapterId

  const sidebar = (
    <>
      <Link to="/letters/new" className="sidebar-new-letter">
        + New letter
      </Link>

      <p className="sidebar-heading">Recent activity</p>
      <GroupActivity />

      <hr className="sidebar-divider" />

      <p className="sidebar-heading">Your group</p>
      <ul className="sidebar-links">
        <li>
          <Link to="/replies/new">Record a reply</Link>
        </li>
        <li>
          <Link to="/invite-codes">Invite codes</Link>
        </li>
        <li>
          <Link to="/blocked-writers">Blocked writers</Link>
        </li>
        <li>
          <Link to="/settings/keys">Group key</Link>
        </li>
        <li>
          <Link to="/settings">Group settings</Link>
        </li>
      </ul>

      <hr className="sidebar-divider" />

      <div className="sidebar-account">
        Signed in as group admin
        <br />
        <strong>{user?.name ?? user?.username}</strong>
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault()
            signOut()
          }}
        >
          Sign out
        </a>
      </div>
    </>
  )

  return (
    <AppShell sidebar={sidebar}>
      <title>Group inbox · letters.support</title>
      <div className="inbox-hero">
        <p className="inbox-hero-sub">Group inbox</p>
        <h1 className="inbox-hero-title">{group.group.name}</h1>
      </div>

      {/* The group-owner admin hands the key to admins waiting for it; renders nothing for anyone else. */}
      <MembersWaitingNotice />

      <div className="group-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab}
            className={t.key === tab ? 'group-tab active' : 'group-tab'}
            onClick={() => setParams({ tab: t.key })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {chapterId !== null && tab === 'print' && <PrintQueue chapterId={chapterId} keyState={group.keyState} />}
      {tab === 'conversations' && <GroupConversations />}
      {tab === 'writers' && <GroupWriters />}
    </AppShell>
  )
}
