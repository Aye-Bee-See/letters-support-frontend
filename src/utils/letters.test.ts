import { describe, expect, it } from 'vitest'
import type { ApiError } from '../types'
import { deleteQuestion, directionLabel, needsWriter, oldKeyText, queuedLetterRefusal } from './letters'

describe('directionLabel', () => {
  it('marks anything from the prisoner as received', () => {
    expect(directionLabel('prisoner', 'queued')).toEqual({ inbound: true, text: 'received' })
  })

  it('describes the writer’s own letter by its status', () => {
    expect(directionLabel('user', 'queued')).toEqual({ inbound: false, text: 'waiting to print' })
    expect(directionLabel('user', 'mailed')).toEqual({ inbound: false, text: 'mailed' })
    expect(directionLabel('user', 'returned')).toEqual({ inbound: false, text: 'returned' })
    expect(directionLabel('user', 'declined')).toEqual({ inbound: false, text: 'not sent' })
  })

  it('says a held letter is on hold, not waiting to print', () => {
    expect(directionLabel('user', 'queued', 'writer_blocked')).toEqual({ inbound: false, text: 'on hold' })
    expect(directionLabel('user', 'queued', null)).toEqual({ inbound: false, text: 'waiting to print' })
    expect(directionLabel('prisoner', 'queued', 'writer_blocked')).toEqual({ inbound: true, text: 'received' })
  })
})

describe('needsWriter', () => {
  it('is true only for held letters the writer must act on', () => {
    expect(needsWriter({ heldReasons: ['choose_relay'] })).toBe(true)
    expect(needsWriter({ heldReasons: ['reseal_needed'] })).toBe(true)
    expect(needsWriter({ heldReasons: ['prisoner_free'] })).toBe(false)
    // The group settles a block (lifts it, prints or declines), not the writer.
    expect(needsWriter({ heldReasons: ['writer_blocked'] })).toBe(false)
    expect(needsWriter({ heldReasons: [] })).toBe(false)
  })
})

describe('oldKeyText (API #198)', () => {
  it('says an envelope was sealed under an older group key, or a newer one than the session holds', () => {
    expect(oldKeyText(1, 2).short).toBe('Sealed under an older group key')
    expect(oldKeyText(1, 2).long).toContain('version 1; your group’s key is now version 2')
    expect(oldKeyText(3, 2).short).toBe('Sealed under a newer group key')
    expect(oldKeyText(3, 2).long).toContain('sign in again')
  })
})

describe('deleteQuestion', () => {
  it('asks by the hold', () => {
    expect(deleteQuestion(null, 'Ana Ruiz')).toBe('Delete this letter? It won’t be printed or mailed, and it can’t be brought back.')
    expect(deleteQuestion('prisoner_free', 'Ana Ruiz')).toContain('Ana Ruiz has been released, so it may never reach them')
    expect(deleteQuestion('reseal_needed', 'Ana Ruiz', true)).toMatch(/^Delete this letter and write it again\?/)
    expect(deleteQuestion('reseal_needed', 'Ana Ruiz', true)).toContain('Ana Ruiz’s facility')
  })
})

describe('queuedLetterRefusal', () => {
  const error = (over: Partial<ApiError>): ApiError => ({ status: 400, name: null, condition: null, errors: [], message: 'API sentence', ...over })

  it('says nothing changed when the server could not be reached', () => {
    expect(queuedLetterRefusal(error({ status: 0 }), 'delete')).toContain('Nothing was changed')
  })

  it('names the group that blocked the writer', () => {
    expect(queuedLetterRefusal(error({ status: 403, name: 'GroupBlockError' }), 'choose', 'PDX ABC')).toMatch(/^PDX ABC isn’t mailing your letters/)
  })

  it('reads any other 403 as printed meanwhile', () => {
    expect(queuedLetterRefusal(error({ status: 403 }), 'delete')).toMatch(/^This letter can’t be deleted any more/)
    expect(queuedLetterRefusal(error({ status: 403 }), 'choose')).toMatch(/^This letter can’t be changed any more/)
    expect(queuedLetterRefusal(error({ status: 403 }), 'edit')).toMatch(/^This letter can’t be edited any more: the group has printed it/)
  })

  it('words the relay group refusals by field and code, never the sentence', () => {
    const sealed = error({ problems: [{ field: 'relayChapter', code: 'not_settable_here' }], errors: ['End-to-end mode: relayChapter cannot change'] })
    expect(queuedLetterRefusal(sealed, 'choose')).toContain('Delete it and write it again')
    const gone = error({ problems: [{ field: 'relayChapter', code: 'not_eligible' }], errors: ['x'] })
    expect(queuedLetterRefusal(gone, 'choose', 'PDX ABC')).toBe('PDX ABC doesn’t mail to this facility any more. Reload and choose again.')
    expect(queuedLetterRefusal(error({ errors: ['Something about a field.'] }), 'choose')).toBe('Something about a field.')
    expect(queuedLetterRefusal(error({ status: 404 }), 'delete')).toContain('gone already')
    expect(queuedLetterRefusal(error({ status: 502 }), 'delete')).not.toContain('API sentence')
  })
})
