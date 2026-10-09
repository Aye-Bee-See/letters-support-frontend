import { describe, expect, it } from 'vitest'
import { isRole, ROLE_LABELS } from './users'

describe('roles', () => {
  it('uses the screens’ words', () => {
    expect(ROLE_LABELS).toEqual({ user: 'writer', chapter: 'group admin', admin: 'site admin', banned: 'banned' })
  })

  it('knows the API’s roles and nothing else', () => {
    expect(isRole('chapter')).toBe(true)
    expect(isRole('superadmin')).toBe(false)
    expect(isRole(null)).toBe(false)
  })
})
