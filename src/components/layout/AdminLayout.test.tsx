import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/render'
import { AdminStyles } from './AdminLayout'

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
