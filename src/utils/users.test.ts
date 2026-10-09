import { describe, expect, it } from 'vitest'
import type { ApiError } from '../types'
import { accountRefusal, deleteRefusal, isRole, managedNote, ROLE_LABELS } from './users'

const SENTENCE = 'The API’s own sentence, not stable.'
const refusal = (over: Partial<ApiError>): ApiError => ({ status: 400, name: null, condition: null, errors: [], message: SENTENCE, ...over })

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

describe('managedNote', () => {
  const independent = { anonymousForChapter: null, managedBy: null, claimedAt: null }
  it('says nothing of an ordinary account, or a claimed one', () => {
    expect(managedNote(independent)).toBeNull()
    expect(managedNote({ ...independent, managedBy: 3, claimedAt: '2026-10-01T00:00:00Z' })).toBeNull()
  })
  it('names a group’s anonymous account and an unclaimed writer', () => {
    expect(managedNote({ ...independent, anonymousForChapter: 3, managedBy: 3 })).toMatch(/shared anonymous account/)
    expect(managedNote({ ...independent, managedBy: 3 })).toMatch(/managed writer/)
  })
})

describe('deleteRefusal', () => {
  it('words each AccountDeleteError condition, never the API’s sentence', () => {
    for (const [condition, words] of [
      ['only_admin', /only site admin account/],
      ['group_owner', /group-owner admin/],
      ['last_key_holder', /last holder of its group’s key/],
      ['anonymous', /shared anonymous account/],
    ] as const) {
      const text = deleteRefusal(refusal({ status: 409, name: 'AccountDeleteError', condition }))
      expect(text).toMatch(words)
      expect(text).not.toContain(SENTENCE)
    }
  })

  it('falls back to the account wording', () => {
    expect(deleteRefusal(refusal({ status: 404, name: 'NotFoundError' }))).toMatch(/no such account/)
    expect(deleteRefusal(refusal({ status: 409, name: 'AccountDeleteError', condition: 'something_new' }))).toMatch(/refused this \(409\)/)
  })
})

describe('accountRefusal', () => {
  it('words a two-factor reset with nothing to reset', () => {
    expect(accountRefusal(refusal({ status: 409, name: 'TwoFactorError', condition: 'not_enabled' }))).toMatch(/isn’t on for this account/)
  })

  it('says a 403 is about being a site admin, not about a group', () => {
    expect(accountRefusal(refusal({ status: 403, name: 'AuthorizationError' }))).toMatch(/only a site admin/)
  })

  it('shows a 400’s first sentence, as every 400 does', () => {
    expect(accountRefusal(refusal({ errors: ['chapterId must name a group'] }))).toBe('chapterId must name a group')
    expect(accountRefusal(refusal({ status: 429, retryAfter: 30 }))).toMatch(/Wait 30 seconds/)
  })
})
