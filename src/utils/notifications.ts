import type { Notification, NotificationEvent } from '../types'

// Feed entries in words (README "The feed"). Entries carry ids and states,
// never letter content, so each line is worded from `event` and `detail`.
// A plain map, one entry per event. The block and ban lines say who did what
// and what happened to the letters.

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

const EVENT_WORDING: Partial<Record<NotificationEvent, (detail: Detail, n: Notification) => string>> = {
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

/**
 * Who reads the line, and about whom. A writer's feed (README "The feed":
 * `letter.reply`, `letter.status`, `prisoner.moved`, `prisoner.status`,
 * `writer.block`) is about their own letters and the people they write to, so
 * it is worded as theirs; `prisonerName` names the person, when the page knows
 * the thread.
 */
export interface WordingContext {
  forWriter?: boolean
  prisonerName?: string | null
}

/** A writer's letter moving on: one letter, several. */
const WRITER_STATUS_WORDS: Record<string, [string, string]> = {
  printed: ['was printed', 'were printed'],
  mailed: ['was mailed', 'were mailed'],
  returned: ['came back in the post', 'came back in the post'],
  declined: ['wasn’t sent', 'weren’t sent'],
}

/** "Your letter to Jane was mailed", "3 of your letters to Jane were mailed". */
function writerStatusLine(d: Detail, to: string): string {
  const status = str(d.status)
  const count = num(d.count)
  const many = count !== null && count > 1
  const subject = many ? `${count} of your letters${to}` : `Your letter${to}`
  const words = status ? WRITER_STATUS_WORDS[status] : undefined
  if (!words) return `${subject} moved on`
  const label = status === 'declined' ? str(d.ruleLabel) : null
  return `${subject} ${words[many ? 1 : 0]}${label ? `: “${label}”` : ''}`
}

/** A held count, as the writer reads it: "; 1 of your letters to them is on hold". */
const writerHeldClause = (held: number | null) =>
  held ? `; ${held === 1 ? '1 of your letters to them is' : `${held} of your letters to them are`} on hold` : ''

const WRITER_WORDING: Partial<Record<NotificationEvent, (detail: Detail, name: string | null) => string>> = {
  'letter.reply': (_d, name) => (name ? `${name} wrote back` : 'A reply to your letter arrived'),
  'letter.status': (d, name) => writerStatusLine(d, name ? ` to ${name}` : ''),
  'prisoner.moved': (d, name) => `${name ?? 'Someone you write to'} was moved to another facility${writerHeldClause(num(d.held))}`,
  'prisoner.status': (d, name) =>
    d.status === 'free'
      ? `${name ?? 'Someone you write to'} has been released${writerHeldClause(num(d.held))}`
      : `${name ?? 'Someone you write to'} has a new status`,
  // README "The feed": `chapter` carries the group's id and name.
  'writer.block': (d) => {
    const chapter = d.chapter && typeof d.chapter === 'object' ? str((d.chapter as Detail).name) : null
    if (d.action === 'lifted') return chapter ? `${chapter} is mailing your letters again` : 'A group is mailing your letters again'
    return chapter ? `${chapter} has stopped mailing your letters` : 'A group has stopped mailing your letters'
  },
}

/** One feed entry in words. An event this client doesn't know yet still reads as something. */
export function wordEvent(n: Notification, context: WordingContext = {}): string {
  const detail = n.detail ?? {}
  const forWriter = context.forWriter ? WRITER_WORDING[n.event] : undefined
  if (forWriter) return forWriter(detail, context.prisonerName ?? null)
  const word = EVENT_WORDING[n.event]
  return word ? word(detail, n) : 'Something changed'
}

/**
 * What is new on a writer's conversation, in a word for its inbox row
 * ("Mailed", "Returned"); null for an entry that isn't about one letter or person.
 */
export function writerEventTag(n: Notification): string | null {
  switch (n.event) {
    case 'letter.reply':
      return 'New reply'
    case 'letter.status':
      switch (n.detail?.status) {
        case 'printed':
          return 'Printed'
        case 'mailed':
          return 'Mailed'
        case 'returned':
          return 'Returned'
        case 'declined':
          return 'Not sent'
        default:
          return 'Updated'
      }
    case 'prisoner.moved':
      return 'Moved'
    case 'prisoner.status':
      return n.detail?.status === 'free' ? 'Released' : 'Updated'
    default:
      return null
  }
}

/** Tags that need the writer (a letter came back or wasn't sent, the person moved or was freed), as against good news. */
export const isWorryingTag = (tag: string) => ['Returned', 'Not sent', 'Moved', 'Released'].includes(tag)
