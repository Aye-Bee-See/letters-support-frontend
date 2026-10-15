import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeApi } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import NewAccount from './NewAccount'

// New staff account by encryption mode (API #211): in end-to-end mode a landing
// that points to invitations and to promotion on an account's page; in server
// mode the form.

describe('NewAccount', () => {
  it('in end-to-end mode says how staff accounts are made, with no form', async () => {
    fakeApi.on('GET', '/auth/encryption-readiness', { mode: 'e2e' })
    renderApp(<NewAccount />, { at: '/admin/users/new', session: { role: 'admin' } })
    expect((await screen.findByRole('link', { name: 'Invite a group admin' })).getAttribute('href')).toBe('/admin/invite')
    expect(screen.getByRole('link', { name: 'Find the account' }).getAttribute('href')).toBe('/admin/users')
    expect(screen.getByText(/change its role to site admin/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Make the account' })).toBeNull()
  })

  it('in server mode shows the form', async () => {
    fakeApi.on('GET', '/auth/encryption-readiness', { mode: 'server' })
    renderApp(<NewAccount />, { at: '/admin/users/new', session: { role: 'admin' } })
    expect(await screen.findByRole('button', { name: 'Make the account' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Invite a group admin' })).toBeNull()
  })
})
