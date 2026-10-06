import type { Notification, NotificationEvent } from '../types'

// Feed entries in words (README "The feed"). Entries carry ids and states,
// never letter content, so each line is worded from `event` and `detail`.
// A plain map, one entry per event, so other pages can add theirs. Written by
// two packages at once (WP1 inbox, WP4b blocks) and merged into this one map;
// the block and ban lines are WP4b's, which say who did what and what happened
// to the letters.

type Detail = Record<string, unknown>

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
const letters = (n: number) => (n === 1 ? '1 letter' : `${n} letters`)

/** A count of letters held or released, as a trailing clause; nothing for none. */
const heldClause = (held: number | null, verb: string) => (held ? `; ${letters(held)} ${held === 1 ? 'is' : 'are'} ${verb}` : '')

const STATUS_WORDS: Record<string, string> = {
  printed: 'printed',
  mailed: 'mailed',
  returned: 'marked as came back',
  declined: 'marked as not sent',
}

export const EVENT_WORDING: Partial<Record<NotificationEvent, (detail: Detail, n: Notification) => string>> = {
  'letter.reply': () => 'A reply from a prisoner was recorded',
  // README "Paper letters": a paper letter arrives printed, to be mailed.
  'letter.queued': (d) => (d.paper === true ? 'A paper letter was handed to your group to mail' : 'A new letter is waiting to be printed'),
  // Batched moves carry `count` (README "PUT /messaging/status/batch").
  'letter.status': (d) => {
    const status = str(d.status)
    const word = (status && STATUS_WORDS[status]) ?? 'moved on'
    const count = num(d.count)
    if (status === 'declined' && str(d.ruleLabel)) return `${count && count > 1 ? `${count} letters were` : 'A letter was'} not sent: “${str(d.ruleLabel)}”`
    return count && count > 1 ? `${count} letters were ${word}` : `A letter was ${word}`
  },
  'submission.decided': (d) => (d.status === 'approved' ? 'A change you proposed to the directory was approved' : 'A change you proposed to the directory was turned down'),
  'prisoner.moved': (d) => `Someone your group writes to was moved to another facility${heldClause(num(d.held), 'on hold')}`,
  'prisoner.status': (d) =>
    d.status === 'free'
      ? `Someone your group writes to has been released${heldClause(num(d.held), 'on hold')}`
      : 'Someone your group writes to has a new status',
  // README "Group keys".
  'group.key': (d) => {
    switch (d.action) {
      case 'set':
        return 'The group key was set up'
      case 'handed':
        return 'The group key was handed to a group admin'
      case 'removed':
        return 'A group admin was taken off the group key'
      case 'rotated':
        return num(d.keyVersion) ? `The group key was replaced (version ${num(d.keyVersion)})` : 'The group key was replaced'
      default:
        return 'The group key changed'
    }
  },
  'group.owner': (d) =>
    d.by === 'superadmin'
      ? 'A site admin named a new group-owner admin'
      : d.by === 'first key'
        ? 'The group admin who set up the group key is now the group-owner admin'
        : 'The group-owner admin passed ownership to another group admin',
  'group.waiting': () => 'A group admin is waiting to be handed the group key',
  // README "Blocking a writer".
  'group.block': (d) => {
    const held = num(d.held)
    const released = num(d.released)
    if (d.action === 'lifted') {
      return `A group admin unblocked a writer from your group${released ? `; ${letters(released)} went back into the queue` : ''}`
    }
    return `A group admin blocked a writer from your group${held ? `; ${letters(held)} of theirs waiting in your queue ${held === 1 ? 'is' : 'are'} held` : ''}`
  },
  'writer.block': (d) => (d.action === 'lifted' ? 'A group is mailing your letters again' : 'A group has stopped mailing your letters'),
  // README "Recommending a site-wide block".
  'ban.recommended': () => 'A group recommends blocking a writer from the whole site',
  'ban.decided': (d) =>
    d.decision === 'banned'
      ? 'A site admin blocked a writer your group recommended from the whole site'
      : 'A site admin dismissed your group’s recommendation to block a writer from the whole site',
}

/** One feed entry in words. An event this client doesn't know yet still reads as something. */
export function wordEvent(n: Notification): string {
  const word = EVENT_WORDING[n.event]
  return word ? word(n.detail ?? {}, n) : 'Something changed'
}
