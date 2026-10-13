// Every date on screen, in one locale (en-US), from here.
//
// Two kinds of value, read two ways:
// - Timestamps (a letter written, a block made, a record verified) are moments,
//   shown as the day and time where the reader is: longDate, shortDate, dateTime.
// - Calendar fields (detained since, release date) are a day with no time of
//   day, stored as midnight UTC, so they are read in UTC and never shift with
//   the reader's time zone: calendarDate. A year alone, or 1 January of one, is
//   a value whose day nobody knows, and shows as the year.

const LOCALE = 'en-US'

type When = string | Date

const toDate = (when: When) => (typeof when === 'string' ? new Date(when) : when)

/** The date, or null for nothing or a value that doesn't parse. */
function parsed(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

const DAY: Record<'short' | 'long', Intl.DateTimeFormatOptions> = {
  short: { month: 'short', day: 'numeric', year: 'numeric' },
  long: { month: 'long', day: 'numeric', year: 'numeric' },
}

/** A timestamp's day where the reader is: "October 13, 2026". */
export const longDate = (when: When) => toDate(when).toLocaleDateString(LOCALE, DAY.long)

/** A timestamp's day where the reader is: "Oct 13, 2026". */
export const shortDate = (when: When) => toDate(when).toLocaleDateString(LOCALE, DAY.short)

/**
 * A timestamp's day and time where the reader is: "Oct 13, 2026, 3:05 PM";
 * with `seconds`, "3:05:09 PM"; with `zone`, the reader's time zone after it
 * ("3:05 PM EDT"), for a deadline someone elsewhere may read.
 */
export function dateTime(when: When, { seconds = false, zone = false }: { seconds?: boolean; zone?: boolean } = {}): string {
  return toDate(when).toLocaleString(LOCALE, {
    ...DAY.short,
    hour: 'numeric',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    ...(zone ? { timeZoneName: 'short' } : {}),
  })
}

/** A bare year ("2010"), or 1 January of one: a value whose day nobody knows. */
const yearOnly = (iso: string) => /^\d{4}(-01-01(T00:00(:00(\.0+)?)?(Z|[+-]00:?00)?)?)?$/.test(iso)

/**
 * A calendar field, read in UTC: "Jul 14, 2021" (or "July 14, 2021" with
 * `long`), "2010" for a year alone, or null for nothing or a value that
 * doesn't parse.
 */
export function calendarDate(iso: string | null | undefined, style: 'short' | 'long' = 'short'): string | null {
  const d = parsed(iso)
  if (!d || !iso) return null
  if (yearOnly(iso)) return String(d.getUTCFullYear())
  return d.toLocaleDateString(LOCALE, { ...DAY[style], timeZone: 'UTC' })
}

/**
 * A day as stored, read in UTC, without calendarDate's year rule: for a value
 * that always has a day, such as a news item's publication date. "July 14,
 * 2021", or null for nothing or a value that doesn't parse.
 */
export function utcDate(iso: string | null | undefined, style: 'short' | 'long' = 'long'): string | null {
  const d = parsed(iso)
  return d && d.toLocaleDateString(LOCALE, { ...DAY[style], timeZone: 'UTC' })
}

/** A month and year, read in UTC: "July 2021". */
export const monthYear = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' })
