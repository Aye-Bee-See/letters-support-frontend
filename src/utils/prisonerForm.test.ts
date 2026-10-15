import { describe, expect, it } from 'vitest'
import type { Prisoner } from '../types'
import { changes, confirmAddress, EMPTY_PRISONER, problems, toForm, toRecord } from './prisonerForm'

const prisoner = {
  id: 7,
  birthName: 'Anna Ivanova',
  chosenName: null,
  aliases: ['Anya'],
  prison: 3,
  country: 'Belarus',
  inmateID: null,
  releaseDate: '2027-05-01T00:00:00.000Z',
  detainedSince: null,
  sentence: null,
  charges: null,
  estimatedRelease: null,
  bio: 'A bio',
  interests: null,
  photo: null,
  supportWebsite: 'http://anna.example.org',
  donationInfo: null,
  status: 'incarcerated',
  statusNotice: null,
  featured: false,
  verifiedBy: null,
  verifiedAt: null,
  verificationNotes: null,
  recordStatus: 'published',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as Prisoner

describe('problems', () => {
  it('asks for a name, chosen or birth', () => {
    expect(problems(EMPTY_PRISONER)).toEqual(['The record needs a name: a chosen name, a birth name, or both.'])
    expect(problems({ ...EMPTY_PRISONER, birthName: 'Anna' })).toEqual([])
  })

  it('checks the support website on a new record and an edited one alike', () => {
    const bad = 'The support website must be a full address, starting with https://.'
    expect(problems({ ...EMPTY_PRISONER, chosenName: 'Anna', supportWebsite: 'anna.org' })).toEqual([bad])
    expect(problems({ ...toForm(prisoner), supportWebsite: 'anna.org' })).toEqual([bad])
    expect(problems(toForm(prisoner))).toEqual([])
  })
})

describe('toRecord', () => {
  it('sends only what was filled in, lists as arrays', () => {
    const v = { ...EMPTY_PRISONER, chosenName: ' Anna ', aliases: 'Anya\n\n Ann ', prison: '3', releaseDate: '2027-05-01' }
    expect(toRecord(v)).toEqual({ recordStatus: 'draft', chosenName: 'Anna', aliases: ['Anya', 'Ann'], prison: 3, releaseDate: '2027-05-01' })
  })

  it('sends featured only when set', () => {
    expect(toRecord({ ...EMPTY_PRISONER, featured: true, recordStatus: 'published' })).toEqual({ recordStatus: 'published', featured: true })
  })
})

describe('toForm and changes', () => {
  it('reads dates as YYYY-MM-DD and lists one per line', () => {
    const v = toForm(prisoner)
    expect(v.releaseDate).toBe('2027-05-01')
    expect(v.aliases).toBe('Anya')
    expect(v.prison).toBe('3')
  })

  it('sends nothing when nothing changed, blanks as null, an emptied list as []', () => {
    const before = toForm(prisoner)
    expect(changes(before, { ...before })).toEqual({})
    expect(changes(before, { ...before, bio: ' ', aliases: '', prison: '', releaseDate: '', recordStatus: 'draft' })).toEqual({
      bio: null,
      aliases: [],
      prison: null,
      releaseDate: null,
      recordStatus: 'draft',
    })
  })

  it('ignores whitespace-only edits', () => {
    const before = toForm(prisoner)
    expect(changes(before, { ...before, birthName: 'Anna Ivanova  ', aliases: ' Anya \n' })).toEqual({})
  })
})

describe('confirmAddress', () => {
  it('sends the facility and inmate number again as they stand, and nothing else (API #219)', () => {
    expect(confirmAddress(prisoner)).toEqual({ prison: 3, inmateID: null })
    expect(confirmAddress({ prison: null, inmateID: 'A-1' })).toEqual({ prison: null, inmateID: 'A-1' })
  })
})
