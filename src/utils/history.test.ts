import { describe, expect, it } from 'vitest'
import { accountName, actorName, actorsOf, detailAccountIds, detailAccounts, detailLabel, detailWord, historyAction, isAccountDetail } from './history'

describe('actorName', () => {
  const admin = { id: 1, username: 'admin', name: 'Administrator', role: 'admin' as const }
  const groupAdmin = { id: 2, username: 'chapter1', name: null, role: 'chapter' as const }

  it('says "you" for the signed-in account, whatever its role', () => {
    expect(actorName(admin, 1)).toBe('you')
    expect(actorName(groupAdmin, 2)).toBe('you')
  })

  it('names anyone else, a site admin marked so, and the role when there is no name', () => {
    expect(actorName(admin, 2)).toBe('Administrator (site admin)')
    expect(actorName(groupAdmin, 1)).toBe('chapter1')
    expect(actorName({ ...groupAdmin, username: '' }, 1)).toBe('a group admin')
  })

  it('says what a null actor means', () => {
    expect(actorName(null, 1)).toBe('the site itself, or an account since deleted')
    expect(actorName(null, 1, 'someone no longer here')).toBe('someone no longer here')
  })

  it('names someone given without a role (who made a block) by name or username', () => {
    expect(actorName({ id: 3, username: 'chapter2', name: null }, 1)).toBe('chapter2')
    expect(actorName({ id: 3, username: 'chapter2', name: 'Sam' }, 3)).toBe('you')
  })
})

describe('historyAction', () => {
  it('says whether a photo replaced an earlier one (API #215), never the old file’s name', () => {
    expect(historyAction('prisoner.photo', { credit: null, replaced: false })).toBe('Photo added')
    expect(historyAction('prisoner.photo', { credit: null, replaced: true })).toBe('Photo replaced')
    // Older entries recorded the old file's name instead.
    expect(historyAction('prisoner.photo', { replaced: 'a1b2c3.jpg' })).toBe('Photo replaced')
    expect(historyAction('prisoner.photo', null)).toBe('Photo added or replaced')
  })

  it('words the other actions from the table, and an unknown one as the API names it', () => {
    expect(historyAction('prison.relay.add')).toBe('Relay group linked')
    expect(historyAction('something.new')).toBe('something.new')
  })
})

describe('the people an entry’s details name (issue #68)', () => {
  const entries = [
    { action: 'chapter.keys', details: { firstMember: 2, owner: 2 }, actor: { id: 2, username: 'chapter1', name: null, role: 'chapter' as const } },
    { action: 'chapter.member-key', details: { member: 7 }, actor: { id: 2, username: 'chapter1', name: null, role: 'chapter' as const } },
    { action: 'chapter.owner', details: { from: null, to: 7, by: 'superadmin' }, actor: { id: 1, username: 'admin', name: null, role: 'admin' as const } },
    { action: 'chapter.keys.rotate', details: { keyVersion: 2, envelopes: 12, members: [2, 7] }, actor: null },
    { action: 'chapter.block', details: { writer: 31, reason: 'Threats' }, actor: null },
    { action: 'chapter.update', details: { owner: 5, viaSubmission: 14 }, actor: null },
  ]

  it('knows which details hold account ids, action by action', () => {
    expect(isAccountDetail('chapter.keys', 'firstMember')).toBe(true)
    expect(isAccountDetail('chapter.owner', 'by')).toBe(false)
    // A count on a rotation, and the same key on another kind of entry, are not accounts.
    expect(isAccountDetail('chapter.keys.rotate', 'envelopes')).toBe(false)
    expect(isAccountDetail('chapter.update', 'owner')).toBe(false)
    expect(detailAccounts('chapter.keys.rotate', 'members', [2, 7])).toEqual([2, 7])
    // Ownership passing from nobody names nobody.
    expect(detailAccounts('chapter.owner', 'from', null)).toEqual([])
  })

  it('collects every account named, once each', () => {
    expect(detailAccountIds(entries)).toEqual([2, 7, 31])
    expect([...actorsOf(entries).keys()]).toEqual([2, 1])
  })

  it('labels the details in the site’s words, never “member” or “superadmin”', () => {
    expect(detailLabel('chapter.keys', 'firstMember')).toBe('First key holder')
    expect(detailLabel('chapter.keys', 'owner')).toBe('Group-owner admin')
    expect(detailLabel('chapter.member-key', 'member')).toBe('Group admin')
    expect(detailLabel('chapter.block', 'reason')).toBeNull()
    expect(detailWord('chapter.owner', 'by', 'superadmin')).toBe('a site admin')
    expect(detailWord('chapter.owner', 'by', 'owner')).toBe('the group-owner admin')
    expect(detailWord('chapter.block', 'reason', 'owner')).toBeNull()
  })

  it('names an account as an actor is named: you, a name, gone, or not looked up', () => {
    const accounts = new Map([
      [7, { id: 7, username: 'sam', name: 'Sam', role: 'chapter' as const }],
      [1, { id: 1, username: 'admin', name: null, role: 'admin' as const }],
      [9, null],
    ])
    expect(accountName(2, accounts, 2)).toBe('you')
    expect(accountName(7, accounts, 2)).toBe('Sam')
    expect(accountName(1, accounts, 2)).toBe('admin (site admin)')
    expect(accountName(9, accounts, 2)).toBe('an account since deleted')
    expect(accountName(12, accounts, 2)).toBe('account #12')
    expect(accountName(12, accounts, 2, 'someone no longer in the group')).toBe('someone no longer in the group')
  })
})
