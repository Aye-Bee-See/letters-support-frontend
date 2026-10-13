import { describe, expect, it } from 'vitest'
import { displayName, estimatedRelease, heldAt, otherNames, yearOf } from './prisoners'

describe('displayName', () => {
  it('prefers the chosen name, then the birth name', () => {
    expect(displayName({ chosenName: 'Sam', birthName: 'Samuel Jones' })).toBe('Sam')
    expect(displayName({ chosenName: null, birthName: 'Samuel Jones' })).toBe('Samuel Jones')
  })

  it('has a stand-in when neither is listed', () => {
    expect(displayName({ chosenName: null, birthName: null })).toBe('Name not listed')
  })
})

describe('otherNames', () => {
  it('lists the birth name when it differs from the shown name, then aliases, without repeats', () => {
    expect(otherNames({ chosenName: 'Sam', birthName: 'Samuel Jones', aliases: ['Sammy', 'Samuel Jones', 'Sam'] })).toEqual([
      'Samuel Jones',
      'Sammy',
    ])
  })

  it('is empty when the birth name is the shown name and there are no aliases', () => {
    expect(otherNames({ chosenName: null, birthName: 'Samuel Jones', aliases: null })).toEqual([])
  })
})

describe('yearOf', () => {
  it('returns null for a missing or unreadable date', () => {
    expect(yearOf(undefined)).toBeNull()
    expect(yearOf('nope')).toBeNull()
  })

  it('reads the UTC year', () => {
    expect(yearOf('2030-01-01T00:00:00Z')).toBe(2030)
  })
})

describe('estimatedRelease', () => {
  it('prefers the free-text estimate, else the year of the release date', () => {
    expect(estimatedRelease({ estimatedRelease: 'Late 2027', releaseDate: '2030-05-01' })).toBe('Late 2027')
    expect(estimatedRelease({ estimatedRelease: null, releaseDate: '2030-05-01' })).toBe('2030')
    expect(estimatedRelease({ estimatedRelease: null, releaseDate: null })).toBeNull()
  })
})

describe('heldAt', () => {
  it('joins the facility name and country', () => {
    expect(heldAt({ id: 2, prisonName: 'IK-20, Mozyr', country: 'Belarus' } as Parameters<typeof heldAt>[0])).toBe('IK-20, Mozyr, Belarus')
  })

  it('is null when no facility is listed', () => {
    expect(heldAt(null)).toBeNull()
  })
})
