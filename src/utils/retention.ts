import type { RetentionRules } from '../api/letters'
import type { LetterStatus, Message } from '../types'

// README "Retention": a letter is deleted once it has been mailed, returned or
// declined (or a reply recorded) for longer than its writer's window, unless
// it is kept. Queued and printed letters are never touched. The API's own
// rules are in database/retention.js (`windowFor`, SETTLED_STATUSES); these
// mirror them so a page can say when.

/** What retention counts from, and may remove. */
const SETTLED: LetterStatus[] = ['mailed', 'received', 'returned', 'declined']

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The window for a writer whose own choice is `chosenDays` (null: the site
 * default), in days; null when nothing is deleted. The site's cap applies to
 * every choice, "for ever" included. As the API's windowFor.
 */
export function windowFor(chosenDays: number | null | undefined, rules: Pick<RetentionRules, 'defaultDays' | 'maxDays'>): number | null {
  let days = chosenDays ?? rules.defaultDays
  if (rules.maxDays !== null && (days === 0 || days > rules.maxDays)) days = rules.maxDays
  return days === 0 ? null : days
}

/**
 * When this letter is deleted: null when it never is (kept, a window of for
 * ever) or is not yet counting (queued, printed). Counted from the status
 * change that settled it, else its creation, as the API does.
 */
export function deletionDate(m: Pick<Message, 'status' | 'statusChangedAt' | 'createdAt' | 'keep'>, days: number | null): Date | null {
  if (m.keep || days === null || !SETTLED.includes(m.status)) return null
  const since = m.statusChangedAt ?? m.createdAt
  return new Date(new Date(since).getTime() + days * DAY_MS)
}

const longDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

/**
 * The retention line under a settled letter, for its writer or a group that
 * sets a managed writer's window (`days` known), or for a group admin who
 * can't see the writer's window (`days` undefined): no date then, since the
 * writer may have chosen another window than the site's default. Null for a
 * letter retention doesn't touch yet.
 */
export function retentionLine(
  m: Pick<Message, 'status' | 'statusChangedAt' | 'createdAt' | 'keep' | 'sender'>,
  days: number | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!SETTLED.includes(m.status)) return null
  const what = m.sender === 'prisoner' ? 'reply' : 'letter'
  if (m.keep) return `Kept: this ${what} won’t be deleted.`
  if (days === undefined) return `Deleted after the writer’s retention window, unless they keep this ${what}.`
  const when = deletionDate(m, days)
  if (!when) return 'Kept for ever, as your retention window says.'
  if (when.getTime() <= now.getTime()) return `Due to be deleted: its ${days} days are up, and it goes at the next clean-up, within a few hours.`
  return `Deleted on ${longDate(when)}.`
}

/** The windows offered on the retention page: common lengths within the cap, and the default and current choice. */
export function windowChoices(rules: Pick<RetentionRules, 'defaultDays' | 'maxDays' | 'chosenDays'>): number[] {
  const days = new Set([30, 90, 180, 365, 730, rules.defaultDays])
  if (rules.chosenDays) days.add(rules.chosenDays)
  return [...days].filter((d) => d > 0 && (rules.maxDays === null || d <= rules.maxDays)).sort((a, b) => a - b)
}

/** "30 days", "1 year", "2 years". */
export function windowText(days: number | null): string {
  if (days === null) return 'for ever'
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`
  return days === 1 ? '1 day' : `${days} days`
}
