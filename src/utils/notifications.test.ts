import { describe, expect, it } from 'vitest'
import type { Notification, NotificationEvent } from '../types'
import { wordEvent } from './notifications'

const entry = (event: string, detail: Record<string, unknown> | null = null): Notification => ({
  id: 1,
  userId: 1,
  event: event as NotificationEvent,
  chat: null,
  message: null,
  submission: null,
  detail,
  readAt: null,
  createdAt: '2026-10-06T10:00:00.000Z',
  updatedAt: '2026-10-06T10:00:00.000Z',
})

describe('wordEvent (README "The feed")', () => {
  it('tells a paper letter from one to print', () => {
    expect(wordEvent(entry('letter.queued'))).toBe('A new letter is waiting to be printed')
    expect(wordEvent(entry('letter.queued', { paper: true }))).toBe('A paper letter was handed to your group to mail')
  })

  it('counts a batched status move', () => {
    expect(wordEvent(entry('letter.status', { status: 'mailed', count: 3, messages: [1, 2, 3] }))).toBe('3 letters were mailed')
    expect(wordEvent(entry('letter.status', { status: 'printed' }))).toBe('A letter was printed')
  })

  it('words the group events', () => {
    expect(wordEvent(entry('group.key', { action: 'rotated', keyVersion: 3 }))).toContain('version 3')
    expect(wordEvent(entry('group.key', { action: 'handed', member: 7 }))).toContain('handed')
    expect(wordEvent(entry('group.owner', { owner: 7, previous: 2, by: 'superadmin' }))).toContain('site admin')
    expect(wordEvent(entry('group.waiting', { member: 9 }))).toContain('waiting')
    expect(wordEvent(entry('group.block', { action: 'blocked', writer: 12, held: 2 }))).toBe('A group admin blocked a writer from your group; 2 letters of theirs waiting in your queue are held')
    expect(wordEvent(entry('group.block', { action: 'lifted', writer: 12, released: 1 }))).toBe('A group admin unblocked a writer from your group; 1 letter went back into the queue')
    expect(wordEvent(entry('ban.decided', { decision: 'dismissed' }))).toContain('dismissed')
    expect(wordEvent(entry('prisoner.moved', { prisoner: 12, prison: 7, held: 0 }))).toBe('Someone your group writes to was moved to another facility')
    expect(wordEvent(entry('prisoner.status', { status: 'free', held: 1 }))).toContain('1 letter is on hold')
  })

  it('still says something for an event it does not know', () => {
    expect(wordEvent(entry('something.new'))).toBe('Something changed')
  })
})
