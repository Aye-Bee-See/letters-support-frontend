import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getNotifications } from '../../api/notifications'
import { useGroupKeyRefresh } from '../../groups/useGroupKeyRefresh'
import { useApi } from '../../hooks/useApi'
import type { Notification } from '../../types'
import { inboxDate } from '../../utils/letters'
import { wordEvent } from '../../utils/notifications'

// The group's recent feed entries, worded (README "The feed"): letters arriving
// to print, status moves, key and ownership changes, blocks, and site admins'
// decisions on the group's recommendations. Entries hold ids, never content.
// An unread `group.key` entry means the key was set up, handed, taken back or
// rotated since this session opened it (README "Group keys"): the session reads
// its group key again, so the inbox works with the new one without a visit to
// the keys page or a new sign-in.

const SHOWN = 8

/** Where an entry leads, if anywhere: a letter to print opens on its own page, anything else about a thread on the thread. */
function linkOf(n: Notification): string | null {
  if (n.event === 'letter.queued' && n.message) return `/letters/${n.message}/print`
  if (n.chat) return `/threads/${n.chat}`
  if (n.event === 'group.key' || n.event === 'group.owner' || n.event === 'group.waiting') return '/settings/keys'
  if (n.event === 'group.block' || n.event === 'ban.decided') return '/blocked-writers'
  return null
}

export default function GroupActivity() {
  const feed = useApi(() => getNotifications(SHOWN), [])
  const refreshKey = useGroupKeyRefresh()
  const keyChanged = (feed.data ?? []).some((n) => n.event === 'group.key' && !n.readAt)
  useEffect(() => {
    // Quiet: on a failure the session keeps the key it has, and the next visit tries again.
    if (keyChanged) void refreshKey().catch(() => null)
  }, [keyChanged, refreshKey])
  if (feed.loading) return <p className="sidebar-info">Loading…</p>
  // The inbox works without it: say nothing more than that it couldn't load.
  if (feed.error) return <p className="sidebar-info">Recent activity couldn’t be loaded.</p>
  const items = feed.data ?? []
  if (items.length === 0) return <p className="sidebar-info">Nothing yet.</p>
  return (
    <ul className="activity-list">
      {items.map((n) => {
        const to = linkOf(n)
        const text = wordEvent(n)
        return (
          <li key={n.id} className={n.readAt ? 'activity-item' : 'activity-item unread'}>
            {to ? <Link to={to}>{text}</Link> : text}
            <span className="activity-date">{inboxDate(n.createdAt)}</span>
          </li>
        )
      })}
    </ul>
  )
}
