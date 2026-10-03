import { describe, expect, it } from 'vitest'
import { directionLabel, needsWriter } from './letters'

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
