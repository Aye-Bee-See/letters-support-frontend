import { describe, expect, it } from 'vitest'
import type { Notification, NotificationEvent } from '../types'
import { wordEvent, writerEventTag } from './notifications'

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
    expect(wordEvent(entry('group.owner', { owner: 7, by: 'first key' }), { me: 7 })).toBe('You set up the group key, so you are the group-owner admin')
    expect(wordEvent(entry('group.owner', { owner: 7, by: 'first key' }), { me: 8 })).toBe('The group admin who set up the group key is now the group-owner admin')
    expect(wordEvent(entry('group.waiting', { member: 9 }))).toContain('waiting')
    expect(wordEvent(entry('group.block', { action: 'blocked', writer: 12, held: 2 }))).toBe('A group admin blocked a writer from your group; 2 letters of theirs waiting in your queue are held')
    expect(wordEvent(entry('group.block', { action: 'lifted', writer: 12, released: 1 }))).toBe('A group admin unblocked a writer from your group; 1 letter went back into the queue')
    expect(wordEvent(entry('ban.decided', { decision: 'banned' }))).toMatch(/blocked a writer/)
    expect(wordEvent(entry('ban.decided', { decision: 'dismissed' }))).toContain('dismissed')
    expect(wordEvent(entry('prisoner.moved', { prisoner: 12, prison: 7, held: 0 }))).toBe('Someone your group writes to was moved to another facility')
    expect(wordEvent(entry('prisoner.status', { status: 'free', held: 1 }))).toContain('1 letter is on hold')
  })

  it('still says something for an event it does not know', () => {
    expect(wordEvent(entry('something.new'))).toBe('Something changed')
  })
})

describe('wordEvent for a writer (README "The feed")', () => {
  const writer = { forWriter: true, prisonerName: 'Jane Doe' }

  it('words their letter moving on, by name', () => {
    expect(wordEvent(entry('letter.status', { status: 'mailed' }), writer)).toBe('Your letter to Jane Doe was mailed')
    expect(wordEvent(entry('letter.status', { status: 'returned', reason: 'transferred' }), writer)).toBe('Your letter to Jane Doe came back in the post')
    expect(wordEvent(entry('letter.status', { status: 'declined', reason: 'facility_rule', ruleLabel: 'Handwritten letters only' }), writer)).toBe(
      'Your letter to Jane Doe wasn’t sent: “Handwritten letters only”',
    )
    expect(wordEvent(entry('letter.status', { status: 'printed', count: 2 }), { forWriter: true })).toBe('2 of your letters were printed')
  })

  it('words the person moving or being freed, with the writer’s held letters', () => {
    expect(wordEvent(entry('prisoner.moved', { prisoner: 12, prison: 7, held: 0 }), writer)).toBe('Jane Doe was moved to another facility')
    expect(wordEvent(entry('prisoner.status', { status: 'free', held: 1 }), writer)).toBe('Jane Doe has been released; 1 of your letters to them is on hold')
    expect(wordEvent(entry('prisoner.moved', { held: 2 }), { forWriter: true })).toBe(
      'Someone you write to was moved to another facility; 2 of your letters to them are on hold',
    )
  })

  it('words a reply and a block', () => {
    expect(wordEvent(entry('letter.reply'), writer)).toBe('Jane Doe wrote back')
    expect(wordEvent(entry('writer.block', { action: 'blocked', chapter: { id: 3, name: 'PDX ABC' }, reason: 'x' }), writer)).toBe(
      'PDX ABC has stopped mailing your letters',
    )
  })

  it('keeps the shared wording for anything else', () => {
    expect(wordEvent(entry('submission.decided', { status: 'approved' }), writer)).toContain('approved')
  })
})

describe('writerEventTag', () => {
  it('names what is new on a conversation', () => {
    expect(writerEventTag(entry('letter.status', { status: 'returned' }))).toBe('Returned')
    expect(writerEventTag(entry('letter.status', { status: 'declined' }))).toBe('Not sent')
    expect(writerEventTag(entry('letter.status', { status: 'mailed' }))).toBe('Mailed')
    expect(writerEventTag(entry('letter.reply'))).toBe('New reply')
    expect(writerEventTag(entry('prisoner.status', { status: 'free' }))).toBe('Released')
    expect(writerEventTag(entry('writer.block', { action: 'blocked' }))).toBeNull()
  })
})
