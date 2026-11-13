import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { fakeApi, reply } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import AcceptInvitation from './AcceptInvitation'
import Claim from './Claim'

// A claim code and an invitation's code have the same length and look, and the
// person holding one can't tell which it is (issue #67). A code that one page
// doesn't know (a 404) is offered the other page, carried over so it isn't
// typed again. The API is faked.

const CODE = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ23'
const invitation = {
  kind: 'member',
  status: 'pending',
  expiresAt: '2026-12-01T00:00:00.000Z',
  note: null,
  chapter: { id: 3, name: 'Lisbon ABC' },
  invitedBy: { name: 'Sam' },
}

const pages = (
  <Routes>
    <Route path="/claim" element={<Claim />} />
    <Route path="/invitation" element={<AcceptInvitation />} />
  </Routes>
)

describe('a code typed on the wrong page', () => {
  it('offers the invitation page when a claim code is not found, and carries the code there', async () => {
    fakeApi.on('GET', '/auth/claim', reply.error(404, { name: 'NotFoundError' }))
    fakeApi.on('GET', '/invitation/invitation', invitation)
    const user = userEvent.setup()
    const { location } = renderApp(pages, { at: '/claim' })

    await user.type(screen.getByLabelText('Claim code'), CODE)
    await user.click(screen.getByRole('button', { name: /continue|check/i }))
    expect(await screen.findByText('This claim code is not valid')).toBeTruthy()

    await user.click(screen.getByRole('link', { name: 'try this code as an invitation' }))
    expect(location().pathname).toBe('/invitation')
    expect(new URLSearchParams(location().search).get('token')).toBe(CODE)
    expect(fakeApi.callsTo('GET', '/invitation/invitation')).toHaveLength(1)
  })

  it('does not offer it for a claim code that was used or has expired', async () => {
    fakeApi.on('GET', '/auth/claim', reply.error(410, { name: 'ClaimError', condition: 'used' }))
    renderApp(pages, { at: `/claim?token=${CODE}` })

    expect(await screen.findByText('This claim code has already been used')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'try this code as an invitation' })).toBeNull()
  })

  it('offers the claim page when an invitation code is not found', async () => {
    fakeApi.on('GET', '/invitation/invitation', reply.error(404, { name: 'NotFoundError' }))
    fakeApi.on('GET', '/auth/claim', reply.error(404, { name: 'NotFoundError' }))
    const user = userEvent.setup()
    const { location } = renderApp(pages, { at: `/invitation?token=${CODE}` })

    expect(await screen.findByText('This invitation code is not valid')).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'try this code as a claim code' }))
    expect(location().pathname).toBe('/claim')
    expect(new URLSearchParams(location().search).get('token')).toBe(CODE)
  })
})
