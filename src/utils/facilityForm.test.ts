import { describe, expect, it } from 'vitest'
import type { MailRuleList, Prison } from '../types'
import { changes, EMPTY_FACILITY, problems, toForm, toRecord } from './facilityForm'

const list = {
  categories: ['content', 'photos'],
  rules: [
    { tag: 'no_photos', label: 'No photos', category: 'photos', retired: false },
    { tag: 'handwritten_only', label: 'Handwritten letters only', category: 'content', retired: false },
    { tag: 'typed_only', label: 'Typed letters only', category: 'content', retired: false },
  ],
  conflicts: [['handwritten_only', 'typed_only']],
  parameters: {},
} as unknown as MailRuleList

const facility = {
  id: 4,
  prisonName: 'IK-20',
  address: { street: 'ul. Lenina 1', city: 'Mozyr', region: 'Gomel Oblast' },
  country: 'Belarus',
  routing: 'direct',
  scanService: null,
  mailRules: ['typed_only'],
  pageLimit: 4,
  photoLimit: null,
  mailLanguages: ['ru', 'be'],
  notes: null,
  verifiedBy: null,
  verifiedAt: null,
  verificationNotes: null,
  recordStatus: 'published',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as Prison

const none = new Set<string>()
const named = { ...EMPTY_FACILITY, prisonName: 'IK-20', city: 'Mozyr' }

describe('problems', () => {
  it('asks for a name and an address to mail to', () => {
    expect(problems(EMPTY_FACILITY, none, list)).toEqual([
      'The facility needs a name.',
      'Give the address: at least the city, or the lines to print on an envelope.',
    ])
    expect(problems({ ...EMPTY_FACILITY, prisonName: 'IK-20', lines: 'PO Box 1\nMozyr' }, none, list)).toEqual([])
  })

  it('checks the address on an edit too', () => {
    expect(problems({ ...toForm(facility), city: '' }, new Set(facility.mailRules), list)).toEqual([
      'Give the address: at least the city, or the lines to print on an envelope.',
    ])
  })

  it('refuses limits that aren’t whole numbers of at least 1', () => {
    expect(problems({ ...named, pageLimit: '0', photoLimit: '99999999999999999999' }, none, list)).toEqual([
      'Page limit must be a whole number of at least 1, or blank for no limit.',
      'Photo limit must be a whole number of at least 1, or blank for no limit.',
    ])
  })

  it('names a photo limit on a no-photos facility, bad and repeated languages, and conflicting rules', () => {
    const v = { ...named, photoLimit: '2', mailLanguages: 'en, eng, en' }
    expect(problems(v, new Set(['no_photos', 'handwritten_only', 'typed_only']), list)).toEqual([
      'A facility with “No photos” takes no photos, so it can’t have a photo limit: clear one or the other.',
      "Languages are two-letter codes, like en or es: eng isn't one.",
      'A language is listed twice.',
      '“Handwritten letters only” and “Typed letters only” can’t both apply.',
    ])
  })

  it('caps the print lines at 8', () => {
    expect(problems({ ...named, lines: '1\n2\n3\n4\n5\n6\n7\n8\n9' }, none, list)).toEqual(['An envelope takes at most 8 print lines.'])
  })
})

describe('toRecord', () => {
  it('sends only what was filled in, with rules in master-list order', () => {
    const v = { ...named, street: ' ul. Lenina 1 ', pageLimit: '4', mailLanguages: 'RU be' }
    expect(toRecord(v, new Set(['typed_only', 'no_photos']), list)).toEqual({
      prisonName: 'IK-20',
      address: { street: 'ul. Lenina 1', city: 'Mozyr' },
      recordStatus: 'draft',
      pageLimit: 4,
      mailLanguages: ['ru', 'be'],
      mailRules: ['no_photos', 'typed_only'],
    })
  })
})

describe('toForm and changes', () => {
  const rules = new Set(facility.mailRules)

  it('sends nothing when nothing changed', () => {
    const v = toForm(facility)
    expect(changes(facility, v, { ...v }, rules, list)).toEqual({})
  })

  it('sends the whole address, keeping keys the form doesn’t edit', () => {
    const v = toForm(facility)
    expect(changes(facility, v, { ...v, street: '' }, rules, list)).toEqual({ address: { region: 'Gomel Oblast', city: 'Mozyr' } })
  })

  it('sends blanks as null and a changed rule set whole', () => {
    const v = toForm(facility)
    expect(changes(facility, v, { ...v, pageLimit: '', mailLanguages: '', routing: '' }, new Set(['no_photos', 'typed_only']), list)).toEqual({
      routing: null,
      pageLimit: null,
      mailLanguages: null,
      mailRules: ['no_photos', 'typed_only'],
    })
  })
})
