import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeApi, reply } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import { testUser } from '../../test/session'
import Users from './Users'

// The accounts list: its button by encryption mode (API #211).

function serve(mode: 'e2e' | 'server', users = [testUser({ id: 7, username: 'ana' })]) {
  fakeApi.on('GET', '/auth/encryption-readiness', { mode })
  fakeApi.on('GET', '/auth/users', reply.list(users))
}

describe('Users', () => {
  it('invites instead of making an account in end-to-end mode', async () => {
    serve('e2e')
    renderApp(<Users />, { at: '/admin/users', session: { role: 'admin' } })
    expect((await screen.findByRole('link', { name: 'Invite' })).getAttribute('href')).toBe('/admin/invite')
    expect(screen.queryByRole('link', { name: 'New account' })).toBeNull()
  })

  it('makes a new account in server mode', async () => {
    serve('server')
    renderApp(<Users />, { at: '/admin/users', session: { role: 'admin' } })
    await screen.findByText('ana')
    expect(screen.getByRole('link', { name: 'New account' }).getAttribute('href')).toBe('/admin/users/new')
  })
})
