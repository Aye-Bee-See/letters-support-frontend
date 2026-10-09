import { describe, expect, it } from 'vitest'
import { deletionDate, retentionLine, windowChoices, windowFor, windowText } from './retention'

const site = { defaultDays: 90, maxDays: null }
const capped = { defaultDays: 90, maxDays: 365 }
const mailed = { status: 'mailed' as const, statusChangedAt: '2026-10-01T12:00:00.000Z', createdAt: '2026-09-20T12:00:00.000Z', keep: false, sender: 'user' as const }

describe('windowFor', () => {
  it('takes the writer’s choice, else the site default', () => {
    expect(windowFor(30, site)).toBe(30)
    expect(windowFor(null, site)).toBe(90)
  })

  it('reads 0 as for ever, unless the site caps it', () => {
    expect(windowFor(0, site)).toBeNull()
    expect(windowFor(0, capped)).toBe(365)
    expect(windowFor(800, capped)).toBe(365)
  })
})

describe('deletionDate', () => {
  it('counts from the status change that settled the letter', () => {
    expect(deletionDate(mailed, 30)?.toISOString()).toBe('2026-10-31T12:00:00.000Z')
  })

  it('falls back to the creation date', () => {
    expect(deletionDate({ ...mailed, statusChangedAt: null }, 30)?.toISOString()).toBe('2026-10-20T12:00:00.000Z')
  })

  it('never deletes a kept letter, a queued or printed one, or under a window of for ever', () => {
    expect(deletionDate({ ...mailed, keep: true }, 30)).toBeNull()
    expect(deletionDate({ ...mailed, status: 'queued' }, 30)).toBeNull()
    expect(deletionDate({ ...mailed, status: 'printed' }, 30)).toBeNull()
    expect(deletionDate(mailed, null)).toBeNull()
  })
})

describe('retentionLine', () => {
  const now = new Date('2026-10-08T00:00:00.000Z')

  it('gives the writer the date', () => {
    expect(retentionLine(mailed, 30, site, now)).toBe('Deleted on October 31, 2026.')
  })

  it('says kept for a pinned letter or reply', () => {
    expect(retentionLine({ ...mailed, keep: true }, 30, site, now)).toBe('Kept: this letter won’t be deleted.')
    expect(retentionLine({ ...mailed, status: 'received', sender: 'prisoner', keep: true }, 30, site, now)).toBe('Kept: this reply won’t be deleted.')
  })

  it('says when a letter is already due', () => {
    expect(retentionLine(mailed, 5, site, now)).toMatch(/^Due to be deleted: its 5 days are up/)
  })

  it('says nothing for a letter not yet counting', () => {
    expect(retentionLine({ ...mailed, status: 'printed' }, 30, site, now)).toBeNull()
  })

  it('gives a group admin the default, as the default', () => {
    expect(retentionLine(mailed, undefined, site, now)).toBe(
      'Deleted when the writer’s retention window ends: on December 30, 2026 under the site’s default.',
    )
  })
})

describe('windowChoices and windowText', () => {
  it('offers the common lengths within the cap, the default and the current choice', () => {
    expect(windowChoices({ ...site, chosenDays: 45 })).toEqual([30, 45, 90, 180, 365, 730])
    expect(windowChoices({ ...capped, chosenDays: null })).toEqual([30, 90, 180, 365])
  })

  it('words a window', () => {
    expect(windowText(30)).toBe('30 days')
    expect(windowText(365)).toBe('1 year')
    expect(windowText(730)).toBe('2 years')
    expect(windowText(null)).toBe('for ever')
  })
})
