import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { fakeApi } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import AdminLayout, { AdminStyles } from './AdminLayout'

// admin.css restyles html and body, so it is in the document only while an
// admin page is: added on entering /admin, removed on leaving it.

const adminSheets = () => document.head.querySelectorAll('style[data-stylesheet="admin"]')

describe('AdminStyles', () => {
  it('adds the admin stylesheet under /admin and removes it on leaving', async () => {
    const view = renderApp(
      <Routes>
        <Route path="/" element={<p>page: front</p>} />
        <Route path="/admin" element={<AdminStyles />}>
          <Route index element={<Link to="/">Back to the public site</Link>} />
        </Route>
      </Routes>,
      { at: '/admin' },
    )
    expect(adminSheets()).toHaveLength(1)

    await userEvent.setup().click(screen.getByRole('link', { name: 'Back to the public site' }))
    expect(screen.getByText('page: front')).toBeTruthy()
    expect(view.location().pathname).toBe('/')
    expect(adminSheets()).toHaveLength(0)
  })

  it('removes it on unmount', () => {
    const view = renderApp(
      <Routes>
        <Route path="/admin" element={<AdminStyles />} />
      </Routes>,
      { at: '/admin' },
    )
    expect(adminSheets()).toHaveLength(1)
    view.unmount()
    expect(adminSheets()).toHaveLength(0)
  })
})

describe('AdminLayout', () => {
  it('puts the sidebar links in a navigation landmark, and signs out with a button', async () => {
    fakeApi.on('GET', '/moderation/summary', { pendingSubmissions: { prisoner: 2, prison: 0, chapter: 0 }, pendingBanRecommendations: 0 })
    fakeApi.on('POST', '/auth/logout', {})
    const view = renderApp(
      <Routes>
        <Route path="/" element={<p>page: front</p>} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<p>page: dashboard</p>} />
        </Route>
      </Routes>,
      { at: '/admin', session: { role: 'admin' } },
    )
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    for (const name of ['Dashboard', 'Prisoners', 'Accounts', 'Site settings']) expect(within(nav).getByRole('link', { name })).toBeTruthy()
    expect(await within(nav).findByRole('link', { name: /^Moderation Queue\s*2 waiting$/ })).toBeTruthy()

    expect(screen.queryByRole('link', { name: 'Sign out' })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('page: front')).toBeTruthy()
    expect(view.location().pathname).toBe('/')
    expect(view.auth().user).toBeNull()
  })
})
