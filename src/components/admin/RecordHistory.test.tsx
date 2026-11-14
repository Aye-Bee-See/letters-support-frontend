import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeApi, reply } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import { testUser } from '../../test/session'
import type { HistoryEntry } from '../../types'
import RecordHistory, { HistoryItem } from './RecordHistory'

// A group's history names people by account id in its details. Shown as bare
// numbers they say nothing (issue #68): the page names each account as it
// names the actor, and a site admin's page links it. The API is faked.

const ME = 2
const actor = { id: ME, username: 'pax', name: null, role: 'admin' as const }
const entry = (id: number, action: string, details: Record<string, unknown>): HistoryEntry => ({ id, at: '2026-11-12T16:35:00.000Z', action, actor, details })

const session = { role: 'admin' as const, user: { id: ME, username: 'pax' } }

describe('RecordHistory, for a site admin', () => {
  it('names the accounts in the details and links them, asking only for those it doesn’t already know', async () => {
    fakeApi.on(
      'GET',
      '/chapter/history',
      reply.list([
        entry(3, 'chapter.owner', { from: ME, to: 7, by: 'superadmin' }),
        entry(2, 'chapter.member-key', { member: 9 }),
        entry(1, 'chapter.keys', { firstMember: ME, owner: ME }),
      ]),
    )
    fakeApi.on('GET', '/auth/user', testUser({ id: 7, username: 'sam', name: 'Sam', role: 'chapter' }), { params: { id: '7' } })
    fakeApi.on('GET', '/auth/user', reply.error(404, { name: 'NotFoundError' }), { params: { id: '9' } })
    renderApp(<RecordHistory resource="chapter" id={4} />, { session })

    const sam = await screen.findByRole('link', { name: 'Sam' })
    expect(sam.getAttribute('href')).toBe('/admin/users/7')
    // The words, not the API's keys or its role names.
    expect(screen.getByText('First key holder')).toBeTruthy()
    expect(screen.getByText('Group-owner admin')).toBeTruthy()
    expect(screen.getByText('a site admin')).toBeTruthy()
    expect(screen.queryByText('First member')).toBeNull()
    // Yourself, from the entry's own actor: named and linked, with no request.
    const mine = screen.getAllByRole('link', { name: 'you' })
    expect(mine).toHaveLength(3)
    expect(mine[0].getAttribute('href')).toBe(`/admin/users/${ME}`)
    // An account that is gone says so, and has no page to link.
    expect(screen.getByText('an account since deleted')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'an account since deleted' })).toBeNull()
    // No bare numbers left where people are meant.
    for (const dd of document.querySelectorAll('.audit-details dd')) expect(dd.textContent).not.toMatch(/^\d+$/)
    expect(fakeApi.callsTo('GET', '/auth/user').map((r) => r.params.id).sort()).toEqual(['7', '9'])
  })
})

describe('HistoryItem, on a group’s own settings page', () => {
  const people = new Map([[7, { id: 7, username: 'sam', name: 'Sam', role: 'chapter' as const }]])
  const line = (e: HistoryEntry) => {
    renderApp(
      <ul>
        <HistoryItem entry={e} variant="group" accounts={people} />
      </ul>,
      { session },
    )
    return within(screen.getByRole('listitem'))
  }

  it('names who was handed the key, without a link', () => {
    const li = line(entry(1, 'chapter.member-key', { member: 7 }))
    expect(li.getByText(/Group key handed to a group admin/).parentElement?.textContent).toContain('Group key handed to a group admin: Sam')
    expect(li.queryByRole('link')).toBeNull()
  })

  it('says both ends of a change of owner, and someone the group can no longer list', () => {
    const li = line(entry(1, 'chapter.owner', { from: 12, to: 7, by: 'owner' }))
    expect(li.getByText(/Group-owner admin changed/).parentElement?.textContent).toContain('Group-owner admin changed: from someone no longer in the group, to Sam')
  })

  it('leaves a writer it can’t name unsaid rather than showing a number', () => {
    const li = line(entry(1, 'chapter.block.remove', { writer: 31 }))
    const text = li.getByText(/Writer unblocked/).parentElement?.textContent ?? ''
    expect(text).toContain('Writer unblocked')
    expect(text).not.toContain('31')
  })
})
