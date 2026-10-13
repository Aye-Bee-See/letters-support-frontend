import { describe, expect, it } from 'vitest'
import type { Chapter } from '../types'
import { changes, problems, toForm } from './groupForm'

const group = {
  id: 2,
  name: 'Letters North',
  location: { city: 'Leeds', region: 'West Yorkshire' },
  subregion: null,
  country: 'UK',
  about: null,
  website: 'http://north.example.org',
  email: null,
  socialLinks: { mastodon: '@north@example.social' },
  services: ['letters'],
  announcement: null,
  networkRole: 'relay',
  accountStatus: 'active',
  vouchedBy: null,
  ownerId: 5,
  lettersSent: null,
  averageTimeDays: null,
  lettersSentBefore: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Chapter

describe('problems', () => {
  it('passes a stored record, http website included', () => {
    expect(problems(toForm(group))).toEqual([])
  })

  it('names a missing name, a partial website and email, and a count that isn’t whole', () => {
    expect(problems({ ...toForm(group), name: ' ', website: 'north.org', email: 'north@', lettersSentBefore: '2.5' })).toEqual([
      'The group needs a name.',
      'The website must be a full address, starting with https:// (or http://).',
      'The email address doesn’t look right.',
      'Letters sent before joining must be a whole number, 0 or more.',
    ])
  })
})

describe('changes', () => {
  const services = new Set(group.services ?? [])

  it('sends nothing when nothing changed', () => {
    const v = toForm(group)
    expect(changes(group, v, { ...v }, services)).toEqual({})
  })

  it('sends the location and links whole, blanks as null', () => {
    const v = toForm(group)
    const after = { ...v, city: 'York', country: '', social: { ...v.social, mastodon: '' } }
    expect(changes(group, v, after, services)).toEqual({ country: null, location: { region: 'West Yorkshire', city: 'York' }, socialLinks: null })
  })
})
