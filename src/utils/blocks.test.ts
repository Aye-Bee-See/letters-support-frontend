import { describe, expect, it } from 'vitest'
import type { ApiError } from '../types'
import { blockRefusal, canActOn, type BlockableWriter } from './blocks'

const writer: BlockableWriter = { id: 12, name: 'Sam', role: 'user', managedBy: null, anonymousForChapter: null, claimedAt: null }
const refusal = (status: number, name: string | null = null, condition: string | null = null): ApiError => ({
  status,
  name,
  condition,
  errors: [],
  message: 'the API’s own sentence',
})

describe('canActOn', () => {
  it('offers the actions for a writer of their own', () => {
    expect(canActOn(writer, 3)).toBe(true)
  })
  it('not for a writer this group looks after, unless they claimed their account', () => {
    expect(canActOn({ ...writer, managedBy: 3 }, 3)).toBe(false)
    expect(canActOn({ ...writer, managedBy: 3, claimedAt: '2026-10-01T00:00:00Z' }, 3)).toBe(true)
    expect(canActOn({ ...writer, managedBy: 4 }, 3)).toBe(true)
  })
  it('not for an anonymous writer, a group admin, a banned account, or without a group', () => {
    expect(canActOn({ ...writer, anonymousForChapter: 3 }, 3)).toBe(false)
    expect(canActOn({ ...writer, role: 'chapter' }, 3)).toBe(false)
    expect(canActOn({ ...writer, role: 'banned' }, 3)).toBe(false)
    expect(canActOn(writer, null)).toBe(false)
  })
})

describe('blockRefusal', () => {
  it('words a waiting recommendation from name and condition', () => {
    expect(blockRefusal(refusal(409, 'BanRecommendationError', 'pending'), 'recommend')).toMatch(/already has one waiting for this writer/)
  })
  it('never shows the API’s sentence for a known refusal', () => {
    for (const status of [0, 400, 403, 404, 429]) expect(blockRefusal(refusal(status), 'block')).not.toMatch(/API’s own sentence/)
  })
  it('says an unblock found nothing to lift', () => {
    expect(blockRefusal(refusal(404, 'NotFoundError'), 'unblock')).toMatch(/isn’t blocked by your group any more/)
  })
})
