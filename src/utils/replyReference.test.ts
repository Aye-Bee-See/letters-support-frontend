import { describe, expect, it } from 'vitest'
import { checkReference, describeReferenceError, formatReference, normalizeReference } from './replyReference'

describe('normalizeReference', () => {
  it('keeps the digits, dropping dashes, spaces and dots', () => {
    expect(normalizeReference(' 4827-1935-8 ')).toBe('482719358')
    expect(normalizeReference('4827 1935 8')).toBe('482719358')
    expect(normalizeReference('4827.1935.8')).toBe('482719358')
    expect(normalizeReference('4827–1935–8')).toBe('482719358')
  })
})

describe('checkReference', () => {
  it('accepts nine digits whose check digit matches, with or without dashes', () => {
    expect(checkReference('482719358')).toBe('ok')
    expect(checkReference('4827-1935-8')).toBe('ok')
    expect(checkReference('000000000')).toBe('ok')
  })
  it('calls a wrong last digit, or two digits swapped, a mistake', () => {
    expect(checkReference('4827-1935-6')).toBe('checksum')
    expect(checkReference('4872-1935-8')).toBe('checksum')
  })
  it('waits for nine digits, and takes nothing but digits', () => {
    expect(checkReference('')).toBe('incomplete')
    expect(checkReference('4827-1935')).toBe('incomplete')
    expect(checkReference('4827-1935-88')).toBe('incomplete')
    expect(checkReference('4827-1935-A')).toBe('incomplete')
  })
})

describe('describeReferenceError', () => {
  it('words the two refusals from name and condition, and nothing else', () => {
    expect(describeReferenceError({ name: 'ReplyReferenceError', condition: 'checksum' })).toMatch(/mistake in it/)
    expect(describeReferenceError({ name: 'ReplyReferenceError', condition: 'unknown' })).toMatch(/not one of your group’s letters/)
    expect(describeReferenceError({ name: 'ValidationError', condition: null })).toBeNull()
  })
})

describe('formatReference', () => {
  it('prints nine digits as the footer does', () => {
    expect(formatReference('482719358')).toBe('4827-1935-8')
    expect(formatReference('4827 1935 8')).toBe('4827-1935-8')
  })
  it('leaves anything else as typed', () => {
    expect(formatReference('4827-19')).toBe('4827-19')
  })
})
