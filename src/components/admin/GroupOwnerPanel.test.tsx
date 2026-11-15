import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeApi, reply, type FakeRequest } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import type { MemberKeyRoster } from '../../types'
import GroupOwnerPanel from './GroupOwnerPanel'

// A site admin choosing a group's owner (issue #73): from the group's admins,
// and once the group has a key only from those who hold it. The API is faked.

const group = { id: 4, name: 'Admin Crew', ownerId: null }
const sam = { id: 7, username: 'sam', name: 'Sam', publicKey: 'pk-7', holdsGroupKey: true }
const alex = { id: 8, username: 'alex', name: null, publicKey: 'pk-8', holdsGroupKey: false }

const rosterOf = (over: Partial<MemberKeyRoster>): MemberKeyRoster => ({
  chapter: 4,
  publicKey: 'group-pk',
  keyVersion: 1,
  keyRotatedAt: null,
  owner: null,
  waiting: [],
  members: [sam, alex],
  ...over,
})

const session = { role: 'admin' as const }
/** The roster row of a group admin (the owner is also named, and linked, above the table). */
const row = (name: string) => within(screen.getAllByRole('link', { name }).map((link) => link.closest('tr')).find((tr) => tr !== null) as HTMLElement)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GroupOwnerPanel', () => {
  it('names an owner from the key holders, and offers nobody who doesn’t hold the key', async () => {
    let roster = rosterOf({})
    const puts: FakeRequest[] = []
    fakeApi.on('GET', '/auth/member-keys', () => roster)
    fakeApi.on('PUT', '/auth/chapter-owner', (r: FakeRequest) => {
      puts.push(r)
      roster = rosterOf({ owner: 7 })
      return { chapter: 4, owner: 7, previous: null, holdsGroupKey: true }
    })
    vi.stubGlobal('confirm', vi.fn(() => true))
    let changed = 0
    renderApp(<GroupOwnerPanel group={group} onChanged={() => changed++} />, { session })

    // The one without the key is shown, and can't be chosen.
    expect(await screen.findByRole('link', { name: 'alex' })).toBeTruthy()
    expect(row('alex').getByText('Doesn’t hold the group key yet')).toBeTruthy()
    expect(row('alex').queryByRole('button')).toBeNull()
    expect(screen.getByText('nobody.')).toBeTruthy()

    await userEvent.setup().click(row('Sam').getByRole('button', { name: 'Make owner' }))
    expect(puts.map((r) => r.body)).toEqual([{ chapter: 4, user: 7 }])
    expect((await screen.findByRole('status')).textContent).toBe('Sam is the group-owner admin of Admin Crew now.')
    // The roster is read again and says who owns the group; the page is told, for its history.
    await waitFor(() => expect(row('Sam').getByText('Group-owner admin')).toBeTruthy())
    expect(row('Sam').queryByRole('button')).toBeNull()
    expect(changed).toBe(1)
  })

  it('lets any group admin be chosen while the group has no key', async () => {
    fakeApi.on('GET', '/auth/member-keys', rosterOf({ publicKey: null, keyVersion: 0, members: [{ ...sam, holdsGroupKey: false }, alex] }))
    renderApp(<GroupOwnerPanel group={group} onChanged={() => {}} />, { session })
    expect(await screen.findAllByRole('button', { name: 'Make owner' })).toHaveLength(2)
  })

  it('says so when a group has a key, no owner, and no group admin holding it', async () => {
    fakeApi.on('GET', '/auth/member-keys', rosterOf({ members: [alex] }))
    renderApp(<GroupOwnerPanel group={group} onChanged={() => {}} />, { session })
    expect(await screen.findByText('This group can’t be given an owner from here.')).toBeTruthy()
    expect(screen.getByText(/make them a group admin of Admin Crew again/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Make owner' })).toBeNull()
  })

  it('words a refusal, and reads the list again when the owner changed meanwhile', async () => {
    fakeApi.on('GET', '/auth/member-keys', rosterOf({}))
    fakeApi.on('PUT', '/auth/chapter-owner', reply.error(409, { name: 'OwnerError', error: 'The group-owner admin changed meanwhile; read the chapter again.' }))
    vi.stubGlobal('confirm', vi.fn(() => true))
    renderApp(<GroupOwnerPanel group={group} onChanged={() => {}} />, { session })

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Make owner' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/^Someone else changed the owner just now/)
    await waitFor(() => expect(fakeApi.callsTo('GET', '/auth/member-keys').length).toBeGreaterThan(1))
  })

  it('names an owner who has left the group and links them, but not one whose account is gone', async () => {
    fakeApi.on('GET', '/auth/member-keys', rosterOf({ owner: 12 }))
    fakeApi.on('GET', '/auth/user', { id: 12, username: 'robin', name: 'Robin', role: 'admin' }, { params: { id: '12' } })
    const first = renderApp(<GroupOwnerPanel group={{ ...group, ownerId: 12 }} onChanged={() => {}} />, { session })
    expect((await screen.findByRole('link', { name: 'Robin' })).getAttribute('href')).toBe('/admin/users/12')
    expect(screen.getByText('(not one of this group’s admins any more)')).toBeTruthy()
    first.unmount()

    fakeApi.on('GET', '/auth/user', reply.error(404, { name: 'NotFoundError' }), { params: { id: '12' } })
    renderApp(<GroupOwnerPanel group={{ ...group, ownerId: 12 }} onChanged={() => {}} />, { session })
    expect(await screen.findByText(/an account that isn’t there any more\./)).toBeTruthy()
    // No page to open for an account that is gone: nothing links to it.
    expect(document.querySelector('a[href="/admin/users/12"]')).toBeNull()
  })

  it('does nothing when the question is answered no', async () => {
    fakeApi.on('GET', '/auth/member-keys', rosterOf({}))
    vi.stubGlobal('confirm', vi.fn(() => false))
    renderApp(<GroupOwnerPanel group={group} onChanged={() => {}} />, { session })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Make owner' }))
    expect(fakeApi.callsTo('PUT', '/auth/chapter-owner')).toHaveLength(0)
  })
})
