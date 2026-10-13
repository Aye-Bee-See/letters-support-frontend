import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fakeApi, reply } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import FacilitiesList from './FacilitiesList'

// The admin facility list's mail-rule and language filters: read from the URL,
// sent under the API's own names, and written back to the URL when changed.

const rules = {
  categories: ['content'],
  rules: [
    { id: 1, tag: 'no_photos', category: 'content', label: 'No photos', description: null, retired: false },
    { id: 2, tag: 'no_stickers', category: 'content', label: 'No stickers', description: null, retired: true },
  ],
  conflicts: [],
  parameters: {},
}

function serve() {
  fakeApi.on('GET', '/prison/prisons', reply.list([{ id: 3, prisonName: 'Test Prison', country: 'Spain', recordStatus: 'published', verifiedAt: null }]))
  fakeApi.on('GET', '/prison/filters', { country: [{ value: 'Spain', count: 1 }], routing: [] })
  fakeApi.on('GET', '/prison/mail-rules', rules)
}

const listRequests = () => fakeApi.callsTo('GET', '/prison/prisons').filter((c) => c.params.relay !== 'false')

describe('FacilitiesList filters', () => {
  it('sends the mail rule and language from the URL', async () => {
    serve()
    renderApp(<FacilitiesList />, { at: '/admin/facilities?mailRule=no_photos&language=es', session: { role: 'admin' } })
    await screen.findByText('Test Prison')
    expect(listRequests().at(-1)?.params).toMatchObject({ mailRule: 'no_photos', language: 'es' })
    expect((screen.getByRole('combobox', { name: 'Mail rule' }) as HTMLSelectElement).value).toBe('no_photos')
    expect((screen.getByRole('combobox', { name: 'Language the letter is written in' }) as HTMLSelectElement).value).toBe('es')
    // Retired rules are offered too: a facility may still carry one.
    expect(screen.getByRole('option', { name: 'No stickers (retired)' })).toBeTruthy()
    expect(fakeApi.callsTo('GET', '/prison/mail-rules')[0].params).toMatchObject({ retired: 'true' })
  })

  it('puts a chosen mail rule and language in the URL, and Clear filters takes them out', async () => {
    serve()
    const user = userEvent.setup()
    const view = renderApp(<FacilitiesList />, { at: '/admin/facilities', session: { role: 'admin' } })
    await screen.findByText('Test Prison')
    await screen.findByRole('option', { name: 'No photos' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Mail rule' }), 'no_photos')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language the letter is written in' }), 'es')
    expect(new URLSearchParams(view.location().search).get('mailRule')).toBe('no_photos')
    expect(new URLSearchParams(view.location().search).get('language')).toBe('es')
    await waitFor(() => expect(listRequests().at(-1)?.params).toMatchObject({ mailRule: 'no_photos', language: 'es' }))

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(view.location().search).toBe('')
  })
})
