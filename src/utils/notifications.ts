import type { Notification, NotificationEvent } from '../types'

// One sentence for each feed event (README "The feed": the `detail` column),
// for the activity lists. MERGING: this file is written by two branches at once
// (group-admin-plan.md: WP1 group-inbox and WP4b group-blocks). WORDING has one
// entry per event, one line each, so the merge is the union of both sides'
// entries; keep a single wordEvent below it. Entries read only `n.detail`,
// which holds ids and states, never letter content.

/** A number from `detail` (`held`, `released`, `count`…), 0 when absent. */
const num = (n: Notification, key: string) => Number(n.detail?.[key] ?? 0) || 0
/** "1 letter", "3 letters". */
const lettersOf = (count: number) => `${count} ${count === 1 ? 'letter' : 'letters'}`

const WORDING: Partial<Record<NotificationEvent, (n: Notification) => string>> = {
  'group.block': (n) => (n.detail?.action === 'lifted' ? `A group admin unblocked a writer from your group; ${lettersOf(num(n, 'released'))} went back into the queue.` : `A group admin blocked a writer from your group; ${lettersOf(num(n, 'held'))} of theirs waiting in your queue ${num(n, 'held') === 1 ? 'is' : 'are'} held.`),
  'ban.recommended': () => 'A group recommends blocking a writer from the whole site.',
  'ban.decided': (n) => (n.detail?.decision === 'banned' ? 'A site admin blocked a writer your group recommended from the whole site.' : 'A site admin dismissed your group’s recommendation to block a writer from the whole site.'),
}

/** The feed entry in one sentence; an event this client doesn't know yet still says something. */
export function wordEvent(n: Notification): string {
  return WORDING[n.event]?.(n) ?? 'Something changed.'
}
