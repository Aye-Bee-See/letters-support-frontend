import { act, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Route, Routes, type Location } from 'react-router-dom'
import { fakeApi } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import type { SessionSeed } from '../../test/session'
import { PenNameLock, RequireAdmin, RequireAuth, TwoFactorSetupLock } from './RouteGuards'

// The guards as App.tsx arranges them: the two locks above every route, then
// the role-checked layout routes. Each page says its name.

const page = (name: string) => <p>page: {name}</p>

const app = (
  <>
    <TwoFactorSetupLock />
    <PenNameLock />
    <Routes>
      <Route path="/" element={page('front')} />
      <Route path="/login" element={page('login')} />
      <Route path="/prisoners" element={page('prisoners')} />
      <Route element={<RequireAuth roles={['user', 'chapter']} />}>
        <Route path="/inbox" element={page('inbox')} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/account/security" element={page('security')} />
      </Route>
      <Route element={<RequireAuth roles={['user']} />}>
        <Route path="/account/pen-name" element={page('pen-name')} />
      </Route>
      <Route element={<RequireAuth roles={['chapter']} />}>
        <Route path="/settings" element={page('settings')} />
      </Route>
      <Route path="/admin">
        <Route path="login" element={page('admin-login')} />
        <Route element={<RequireAdmin />}>
          <Route index element={page('admin')} />
          <Route path="queue" element={page('admin-queue')} />
        </Route>
      </Route>
    </Routes>
  </>
)

beforeEach(() => {
  // GroupProvider reads a group admin's group whatever the page.
  fakeApi.on('GET', '/chapter/chapter', { id: 10, name: 'Test Group', accountStatus: 'active', ownerId: 1 })
})

function visit(path: string, session?: SessionSeed) {
  const view = renderApp(app, { at: path, session })
  return { ...view, at: () => view.location().pathname }
}

describe('who reaches which signed-in page', () => {
  const pages = ['/inbox', '/settings', '/account/security', '/account/pen-name', '/admin', '/admin/queue']
  // Where each role ends up from each page above, in order.
  const matrix: [string, SessionSeed, string[]][] = [
    ['a writer', { role: 'user' }, ['/inbox', '/inbox', '/account/security', '/account/pen-name', '/inbox', '/inbox']],
    ['a group admin', { role: 'chapter' }, ['/inbox', '/settings', '/account/security', '/inbox', '/inbox', '/inbox']],
    ['a superadmin', { role: 'admin' }, ['/admin', '/admin', '/account/security', '/admin', '/admin', '/admin/queue']],
    // The API refuses a banned account; were one signed in, /inbox would refuse it in turn.
    ['a banned account', { role: 'banned' }, ['/', '/', '/account/security', '/', '/', '/']],
  ]

  for (const [who, session, lands] of matrix) {
    it(`${who}`, () => {
      pages.forEach((path, i) => {
        const view = visit(path, session)
        expect(view.at(), `${who} at ${path}`).toBe(lands[i])
        view.unmount()
      })
    })
  }

  it('without a session, every one goes to /login, remembering where it was going', () => {
    for (const path of pages) {
      const view = visit(`${path}?page=2#top`)
      expect(view.at()).toBe('/login')
      const from = (view.location().state as { from: Location }).from
      expect([from.pathname, from.search, from.hash]).toEqual([path, '?page=2', '#top'])
      view.unmount()
    }
  })

  it('public pages need no session', () => {
    expect(visit('/prisoners').at()).toBe('/prisoners')
    expect(screen.getByText('page: prisoners')).toBeTruthy()
  })
})

describe('the two locks', () => {
  it('a writer without a pen name is sent to choose one from every page, public ones too', () => {
    for (const path of ['/inbox', '/prisoners', '/']) {
      const view = visit(path, { role: 'user', user: { penName: null } })
      expect(view.at()).toBe('/account/pen-name')
      expect((view.location().state as { from: Location }).from.pathname).toBe(path)
      view.unmount()
    }
  })

  it('a group admin without a pen name is not', () => {
    expect(visit('/inbox', { role: 'chapter', user: { penName: null } }).at()).toBe('/inbox')
  })

  it('a session that must set up two-factor sign-in is sent to the security page from every page, public ones too', () => {
    for (const path of ['/inbox', '/prisoners', '/admin/queue']) {
      const view = visit(path, { role: 'admin', twoFactorSetupRequired: ['superadmins'] })
      expect(view.at()).toBe('/account/security')
      view.unmount()
    }
  })

  it('a keyless writer who must set up two-factor goes to security first, then to choose a pen name', () => {
    const view = visit('/inbox', { role: 'user', user: { penName: null }, twoFactorSetupRequired: ['group'] })
    expect(view.at()).toBe('/account/security')
    expect(screen.getByText('page: security')).toBeTruthy()

    act(() => view.auth().twoFactorSetUp())
    expect(view.at()).toBe('/account/pen-name')
    expect((view.location().state as { from: Location }).from.pathname).toBe('/account/security')
  })

  it('choosing a pen name lifts the pen-name lock', () => {
    const view = visit('/inbox', { role: 'user', user: { penName: null } })
    expect(view.at()).toBe('/account/pen-name')
    act(() => view.auth().penNameChosen('Tess'))
    // The lock no longer sends anywhere; the pen-name page itself sends the writer on.
    expect(view.at()).toBe('/account/pen-name')
    expect(screen.getByText('page: pen-name')).toBeTruthy()
  })

  it('signing out lifts both', () => {
    const view = visit('/prisoners', { role: 'user', user: { penName: null }, twoFactorSetupRequired: ['group'] })
    expect(view.at()).toBe('/account/security')
    act(() => view.auth().endSession())
    // The security page is behind RequireAuth: signed out, it sends to /login.
    expect(view.at()).toBe('/login')
  })
})
