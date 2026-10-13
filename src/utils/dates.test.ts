import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { calendarDate, dateTime, longDate, monthYear, shortDate, utcDate } from './dates'

// A reader west of UTC, so a timestamp's local day and its UTC day can differ.
const savedTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  process.env.TZ = savedTz
})

/** ICU puts a narrow no-break space before AM/PM; compare with plain spaces. */
const plain = (s: string | null) => s?.replace(/\s/g, ' ') ?? null

describe('calendarDate', () => {
  it('reads a stored day in UTC, so it never shifts with the reader’s time zone', () => {
    // 00:30 UTC on the 14th is the evening of the 13th in Los Angeles.
    expect(calendarDate('2021-07-14T00:30:00Z')).toBe('Jul 14, 2021')
    expect(calendarDate('2021-07-14T00:30:00Z', 'long')).toBe('July 14, 2021')
    expect(calendarDate('2010-01-02')).toBe('Jan 2, 2010')
  })

  it('shows a year alone, or 1 January of one, as the year', () => {
    expect(calendarDate('2010')).toBe('2010')
    expect(calendarDate('2010-01-01')).toBe('2010')
    expect(calendarDate('2010-01-01T00:00:00.000Z', 'long')).toBe('2010')
    expect(calendarDate('2010-01-01T00:00:00+00:00')).toBe('2010')
    // A time of day on 1 January is a real day.
    expect(calendarDate('2010-01-01T05:00:00Z')).toBe('Jan 1, 2010')
  })

  it('returns null for a missing or unreadable date', () => {
    expect(calendarDate(null)).toBeNull()
    expect(calendarDate(undefined)).toBeNull()
    expect(calendarDate('')).toBeNull()
    expect(calendarDate('not a date')).toBeNull()
  })
})

describe('utcDate', () => {
  it('reads the day in UTC, with no year rule', () => {
    expect(utcDate('2026-01-01T00:00:00Z')).toBe('January 1, 2026')
    expect(utcDate('2021-07-14T00:30:00Z', 'short')).toBe('Jul 14, 2021')
    expect(utcDate(null)).toBeNull()
    expect(utcDate('nope')).toBeNull()
  })
})

describe('timestamps', () => {
  it('show the reader’s local day', () => {
    expect(shortDate('2021-07-14T00:30:00Z')).toBe('Jul 13, 2021')
    expect(longDate('2021-07-14T00:30:00Z')).toBe('July 13, 2021')
    expect(longDate(new Date('2026-10-13T12:00:00Z'))).toBe('October 13, 2026')
  })

  it('show the date and the local time, with seconds or the zone when asked', () => {
    expect(plain(dateTime('2026-10-13T19:05:09Z'))).toBe('Oct 13, 2026, 12:05 PM')
    expect(plain(dateTime('2026-10-13T19:05:09Z', { seconds: true }))).toBe('Oct 13, 2026, 12:05:09 PM')
    expect(plain(dateTime('2026-10-13T19:05:09Z', { zone: true }))).toBe('Oct 13, 2026, 12:05 PM PDT')
  })
})

describe('monthYear', () => {
  it('reads the month in UTC', () => {
    expect(monthYear('2021-08-01T00:30:00Z')).toBe('August 2021')
  })
})
