import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import type { Prisoner } from '../../types'
import PrisonerProfile from './PrisonerProfile'

// "Print info sheet" prints the page (prisoner-profile.css has its print
// rules): a button, not a link to nowhere.

const prisoner: Prisoner = {
  id: 5,
  birthName: 'Jo Example',
  chosenName: null,
  aliases: null,
  prison: null,
  country: 'US',
  inmateID: null,
  releaseDate: null,
  detainedSince: null,
  sentence: null,
  charges: null,
  estimatedRelease: null,
  bio: null,
  interests: null,
  photo: null,
  supportWebsite: null,
  donationInfo: null,
  status: null,
  statusNotice: null,
  featured: false,
  verifiedBy: null,
  verifiedAt: null,
  prison_details: null,
  support_groups: [],
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PrisonerProfile', () => {
  it('prints the info sheet from a button', async () => {
    fakeApi.on('GET', '/prisoner/prisoner', prisoner)
    // happy-dom has no window.print.
    const print = vi.fn()
    vi.stubGlobal('print', print)
    renderApp(
      <Routes>
        <Route path="/prisoners/:id" element={<PrisonerProfile />} />
      </Routes>,
      { at: '/prisoners/5' },
    )
    const button = await screen.findByRole('button', { name: 'Print info sheet' })
    expect(screen.queryByRole('link', { name: /Print info sheet/ })).toBeNull()
    await userEvent.setup().click(button)
    expect(print).toHaveBeenCalledOnce()
  })

  // API #210: a letter written to someone already free is held from the start.
  it('tells a writer a new letter to someone released is held', async () => {
    fakeApi.on('GET', '/prisoner/prisoner', { ...prisoner, prison: 3, status: 'free', prison_details: { id: 3, prisonName: 'North Unit' } })
    renderApp(
      <Routes>
        <Route path="/prisoners/:id" element={<PrisonerProfile />} />
      </Routes>,
      { at: '/prisoners/5', session: { role: 'user' } },
    )
    expect(await screen.findByText(/A letter mailed to North Unit may never reach them, so a new one is held for the group to decide\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Write a letter' })).toBeTruthy()
  })
})
