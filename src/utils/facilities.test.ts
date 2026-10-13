import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Prison } from '../types'
import { addressLine, addressLines, FILTER_LANGUAGES, isStale, languageOptions, languageParam, mailRuleLines, printLines, restrictionPhrases } from './facilities'

type Limits = Pick<Prison, 'mail_rule_details' | 'pageLimit' | 'photoLimit' | 'mailLanguages'>
const rules = (...labels: string[]) => labels.map((label, i) => ({ id: i + 1, label })) as unknown as Prison['mail_rule_details']

describe('isStale', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('treats a never-verified record as stale', () => {
    expect(isStale(null)).toBe(true)
    expect(isStale(undefined)).toBe(true)
  })

  it('goes stale after 183 days, as the API does', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    expect(isStale('2026-04-01T00:00:00Z')).toBe(false) // 183 days
    expect(isStale('2026-03-31T00:00:00Z')).toBe(true) // 184 days
  })
})

describe('addresses', () => {
  it('uses the facility’s own print lines when it has them, skipping blanks', () => {
    const address = { street: 'ignored', lines: ['Inmate name', '  ', 'PO Box 2000', 'White Deer, PA 17887'] }
    expect(printLines(address)).toEqual(['Inmate name', 'PO Box 2000', 'White Deer, PA 17887'])
    expect(addressLine(address)).toBe('Inmate name, PO Box 2000, White Deer, PA 17887')
  })

  it('composes a line from the structured fields otherwise', () => {
    expect(printLines({ street: 'PO Box 2000', lines: [] })).toBeNull()
    expect(addressLine({ street: 'PO Box 2000', city: 'White Deer, PA', postalCode: '17887' })).toBe('PO Box 2000, White Deer, PA 17887')
  })

  it('keeps any other string parts of the address', () => {
    expect(addressLine({ street: 'ul. Lenina 1', city: 'Mozyr', region: 'Gomel Oblast' })).toBe('ul. Lenina 1, Mozyr, Gomel Oblast')
  })

  it('is null when there is nothing to show', () => {
    expect(addressLine(null)).toBeNull()
    expect(addressLine({})).toBeNull()
  })

  it('builds the profile block from the name, the fields and the country', () => {
    expect(addressLines({ prisonName: 'IK-20', address: { street: 'ul. Lenina 1', city: 'Mozyr' }, country: 'Belarus' })).toEqual([
      'IK-20',
      'ul. Lenina 1',
      'Mozyr',
      'Belarus',
    ])
  })
})

describe('restrictions', () => {
  const prison: Limits = {
    mail_rule_details: rules('No polaroids'),
    pageLimit: 1,
    photoLimit: 3,
    mailLanguages: ['en', 'es'],
  }

  it('lists short phrases for the facilities table, singular where it should be', () => {
    expect(restrictionPhrases(prison)).toEqual(['No polaroids', 'Max 1 page', 'Max 3 photos', 'English or Spanish only'])
  })

  it('writes full sentences for the profile', () => {
    expect(mailRuleLines(prison)).toEqual([
      'No polaroids',
      'At most 1 single-sided page per letter',
      'At most 3 photos per envelope',
      'Letters must be written in English or Spanish',
    ])
  })

  it('is empty for a facility with no rules or limits', () => {
    const none: Limits = { mail_rule_details: [], pageLimit: null, photoLimit: null, mailLanguages: [] }
    expect(restrictionPhrases(none)).toEqual([])
    expect(mailRuleLines(none)).toEqual([])
  })
})

describe('the language filter', () => {
  it('takes only a two-letter code from the URL', () => {
    expect(languageParam('es')).toBe('es')
    expect(languageParam('ES')).toBeUndefined()
    expect(languageParam('spanish')).toBeUndefined()
    expect(languageParam('')).toBeUndefined()
    expect(languageParam(null)).toBeUndefined()
  })

  it('offers the fixed list by name, and a code from a link that isn’t on it', () => {
    const plain = languageOptions()
    expect(plain).toHaveLength(FILTER_LANGUAGES.length)
    expect(plain[0]).toBe('ar') // Arabic
    expect(plain.indexOf('en')).toBeLessThan(plain.indexOf('es')) // English before Spanish
    const more = languageOptions('nl')
    expect(more).toContain('nl')
    expect(more).toHaveLength(FILTER_LANGUAGES.length + 1)
    expect(languageOptions('es')).toHaveLength(FILTER_LANGUAGES.length)
  })
})
