import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, passwordStrength } from './password'

describe('passwordStrength', () => {
  it('says nothing for an empty field', () => {
    expect(passwordStrength('')).toBeNull()
  })

  it('calls anything under the agreed minimum too short', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10)
    expect(passwordStrength('a'.repeat(9))).toEqual({ level: 'weak', label: 'Too short (at least 10 characters)' })
  })

  it('rates a long enough password without symbols as fair', () => {
    expect(passwordStrength('abcdefghij')?.level).toBe('fair')
    expect(passwordStrength('abcdefghijklmnopqrst')?.level).toBe('fair')
  })

  it('rates 10 or 11 characters as fair even with symbols', () => {
    expect(passwordStrength('abcdefghi!')?.level).toBe('fair')
  })

  it('rates 12 to 15 characters with a symbol as good, 16 or more as strong', () => {
    expect(passwordStrength('abcdefghijk!')?.level).toBe('good')
    expect(passwordStrength('abcdefghijklmno!')?.level).toBe('strong')
  })
})
