import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getNotifications, getUnreadNotifications, markNotificationsRead } from '../../api/notifications'
import { useGroupKeyRefresh } from '../../groups/useGroupKeyRefresh'
import { useApi } from '../../hooks/useApi'
import { useGroup } from '../../hooks/useGroup'
import type { Notification } from '../../types'
import { inboxDate } from '../../utils/letters'
import { wordEvent } from '../../utils/notifications'

// The group's recent feed entries, worded (README "The feed"): letters arriving
// to print, status moves, key and ownership changes, blocks, and site admins'
// decisions on the group's recommendations. Entries hold ids, never content.
// An unread `group.key` entry means the key was set up, handed, taken back or
// rotated since this session opened it (README "Group keys"): the session reads
// its group key again, so the inbox works with the new one without a visit to
// the keys page or a new sign-in. That is decided from the whole unread feed,
// not the few entries shown: a busy group's key entry may sit below them.
// An unread `group.owner` entry reloads the group's record (who owns the key).
//
// Once acted on, the entries shown and the ones acted on are marked read
// (PUT /auth/notifications/read), so the next visit neither refreshes the key
// again nor shows them as new; this visit keeps them bold, as they were when
// the page opened. A key refresh that fails leaves its entry unread, for the
// next visit to try again. Nothing else reads `letter.queued` (the print queue
// counts the queue itself), so it is marked read here like the rest.

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
  const unread = useApi(() => getUnreadNotifications(), [])
  const refreshKey = useGroupKeyRefresh()
  const { reload: reloadGroup } = useGroup()
  // Once per visit, when both have answered (or failed).
  const acted = useRef(false)
  const settled = !feed.loading && !unread.loading
  useEffect(() => {
    if (!settled || acted.current) return
    acted.current = true
    const fresh = unread.data ?? []
    const keyEntries = fresh.filter((n) => n.event === 'group.key').map((n) => n.id)
    const ownerEntries = fresh.filter((n) => n.event === 'group.owner').map((n) => n.id)
    const shown = (feed.data ?? []).filter((n) => !n.readAt).map((n) => n.id)
    void (async () => {
      // Quiet: on a failure the session keeps the key it has, and the next visit tries again.
      const keyOk = keyEntries.length === 0 || (await refreshKey().then(() => true, () => false))
      // A new key reloads the record already (GroupProvider); otherwise ownership may still have moved.
      if (keyEntries.length === 0 && ownerEntries.length > 0) reloadGroup()
      const ids = new Set([...shown, ...ownerEntries, ...keyEntries])
      if (!keyOk) keyEntries.forEach((id) => ids.delete(id))
      if (ids.size > 0) await markNotificationsRead([...ids]).catch(() => null)
    })()
  }, [settled, feed.data, unread.data, refreshKey, reloadGroup])
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
