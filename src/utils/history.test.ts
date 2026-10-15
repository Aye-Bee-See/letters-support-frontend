import { describe, expect, it } from 'vitest'
import { actorName, historyAction } from './history'

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
