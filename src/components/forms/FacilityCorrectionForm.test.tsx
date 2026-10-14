import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fakeApi } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import type { Prison } from '../../types'
import FacilityCorrectionForm from './FacilityCorrectionForm'

// The correction form on a facility page: closed until asked for, and the mail
// rule list fetched only then, once per signed-in account.

const prison = {
  id: 7,
  prisonName: 'Test Prison',
  address: { street: '1 Main St', city: 'Testville' },
  country: 'United States',
  routing: 'direct',
  scanService: null,
  mailRules: ['no_photos'],
  pageLimit: null,
  photoLimit: null,
  mailLanguages: null,
  notes: null,
  verifiedBy: null,
  verifiedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
} as unknown as Prison

const rules = {
  categories: ['photos'],
  rules: [{ id: 1, tag: 'no_photos', category: 'photos', label: 'No photos', description: null }],
  conflicts: [],
  parameters: {},
}

function visit(account: number) {
  fakeApi.on('GET', '/chapter/chapter', { id: 10, name: 'Test Group', accountStatus: 'active', ownerId: account })
  fakeApi.on('GET', '/prison/mail-rules', rules)
  return renderApp(<FacilityCorrectionForm prison={prison} />, { session: { role: 'chapter', user: { id: account } } })
}

const ruleFetches = () => fakeApi.callsTo('GET', '/prison/mail-rules').length

describe('FacilityCorrectionForm', () => {
  it('starts closed, and fetches no rules until opened', async () => {
    visit(101)
    expect(await screen.findByRole('button', { name: 'Propose a correction' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: /Facility name/ })).toBeNull()
    expect(ruleFetches()).toBe(0)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Propose a correction' }))
    expect(await screen.findByRole('checkbox', { name: 'No photos' })).toBeTruthy()
    expect(ruleFetches()).toBe(1)
  })

  it('fetches the rules once per account, however often it is opened or shown', async () => {
    const user = userEvent.setup()
    const first = visit(102)
    await user.click(await screen.findByRole('button', { name: 'Propose a correction' }))
    await screen.findByRole('checkbox', { name: 'No photos' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Propose a correction' }))
    await screen.findByRole('checkbox', { name: 'No photos' })
    first.unmount()

    // Another facility page, same sign-in.
    visit(102)
    await user.click(await screen.findByRole('button', { name: 'Propose a correction' }))
    await screen.findByRole('checkbox', { name: 'No photos' })
    expect(ruleFetches()).toBe(1)
  })
})
