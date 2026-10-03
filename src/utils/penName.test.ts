import { describe, expect, it } from 'vitest'
import { samePenName } from './penName'

describe('samePenName', () => {
  it('ignores case and spacing, as the API does', () => {
    expect(samePenName('James Hollow', ' james   HOLLOW ')).toBe(true)
  })
  it('tells different names apart', () => {
    expect(samePenName('James Hollow', 'James Hallow')).toBe(false)
  })
})
