import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { fakeApi, later, reply } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import type { SessionSeed } from '../../test/session'
import type { AccountStatus } from '../../types'
import GroupGate from './GroupGate'

// GroupGate around a group admin's pages: the group's record decides whether the
// page shows, and the session's group key whether a notice sits above it.

const app = (
  <Routes>
    <Route element={<GroupGate />}>
      <Route path="/inbox" element={<p>page: inbox</p>} />
      <Route path="/settings" element={<p>page: settings</p>} />
      <Route path="/settings/keys" element={<p>page: keys</p>} />
    </Route>
  </Routes>
)

const group = (accountStatus: AccountStatus) => ({ id: 10, name: 'Test Group', accountStatus, ownerId: 1 })

function visit(path: string, session: SessionSeed) {
  return renderApp(app, { at: path, session })
}

const NO_KEY = /Your group has no group key yet/
const NOT_HELD = /You don't hold your group's key yet/

describe('GroupGate', () => {
  it('lets writers and superadmins straight through, asking nothing', () => {
    for (const role of ['user', 'admin'] as const) {
      const view = visit('/inbox', { role })
      expect(screen.getByText('page: inbox')).toBeTruthy()
      view.unmount()
    }
    expect(fakeApi.calls).toEqual([])
  })

  it('an account in no group gets a notice instead of the page', () => {
    visit('/inbox', { role: 'chapter', user: { chapterId: null } })
    expect(screen.getByRole('heading', { name: "You're not in a group yet" })).toBeTruthy()
    expect(screen.queryByText('page: inbox')).toBeNull()
    expect(fakeApi.calls).toEqual([])
  })

  it('waits for the group record, then shows the page', async () => {
    const record = later()
    fakeApi.on('GET', '/chapter/chapter', record.answer, { params: { id: '10', full: 'true' } })
    visit('/inbox', { role: 'chapter' })
    expect(screen.getByText('Loading your group…')).toBeTruthy()
    expect(screen.queryByText('page: inbox')).toBeNull()
    record.resolve(group('active'))
    expect(await screen.findByText('page: inbox')).toBeTruthy()
  })

  it('a record that could not be read says so, with a retry', async () => {
    fakeApi.on('GET', '/chapter/chapter', reply.error(500, { error: 'Server error' }))
    visit('/inbox', { role: 'chapter' })
    expect(await screen.findByText(/Couldn't load your group/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('a pending group, or one hidden from its admins (404), is waiting for approval', async () => {
    fakeApi.on('GET', '/chapter/chapter', group('pending'))
    const view = visit('/inbox', { role: 'chapter' })
    expect(await screen.findByRole('heading', { name: 'Your group is waiting for approval' })).toBeTruthy()
    view.unmount()

    fakeApi.on('GET', '/chapter/chapter', reply.error(404, { name: 'NotFoundError' }))
    visit('/settings', { role: 'chapter' })
    expect(await screen.findByRole('heading', { name: 'Your group is waiting for approval' })).toBeTruthy()
    expect(screen.queryByText('page: settings')).toBeNull()
  })

  it('a suspended group is closed', async () => {
    fakeApi.on('GET', '/chapter/chapter', group('suspended'))
    visit('/inbox', { role: 'chapter' })
    expect(await screen.findByRole('heading', { name: 'Your group is suspended' })).toBeTruthy()
    expect(screen.queryByText('page: inbox')).toBeNull()
  })

  it('a group with no key yet: a notice above every page but the key and settings pages', async () => {
    fakeApi.on('GET', '/chapter/chapter', group('active'))
    for (const [path, shown] of [
      ['/inbox', true],
      ['/settings', false],
      ['/settings/', false],
      ['/settings/keys', false],
    ] as const) {
      const view = visit(path, { role: 'chapter', groupKey: 'none' })
      await screen.findByText(/^page: /)
      expect(screen.queryByText(NO_KEY) !== null, path).toBe(shown)
      view.unmount()
    }
  })

  it('a key the admin has not been handed: the other notice', async () => {
    fakeApi.on('GET', '/chapter/chapter', group('active'))
    visit('/inbox', { role: 'chapter', groupKey: 'not-held' })
    expect(await screen.findByText('page: inbox')).toBeTruthy()
    expect(screen.getByText(NOT_HELD)).toBeTruthy()
    expect(screen.queryByText(NO_KEY)).toBeNull()
  })

  it('the key held: the page alone', async () => {
    fakeApi.on('GET', '/chapter/chapter', group('active'))
    visit('/inbox', { role: 'chapter', groupKey: 'held' })
    expect(await screen.findByText('page: inbox')).toBeTruthy()
    expect(screen.queryByText(NO_KEY)).toBeNull()
    expect(screen.queryByText(NOT_HELD)).toBeNull()
  })
})
