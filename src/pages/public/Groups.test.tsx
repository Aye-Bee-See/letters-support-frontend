import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeApi, reply } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import Groups from './Groups'

// The groups page's chips come from GET /chapter/filters (API #213), not from
// the groups on the page.

const group = { id: 4, name: 'Lisbon ABC', country: 'Portugal', subregion: null, location: {}, about: null, services: [], accountStatus: 'active' }

describe('Groups', () => {
  it('builds the chips from the filter values, with a linked country kept', async () => {
    fakeApi.on('GET', '/chapter/chapters', reply.list([group]))
    fakeApi.on('GET', '/chapter/filters', {
      country: [
        { value: 'Spain', count: 3 },
        { value: 'Portugal', count: 1 },
      ],
      networkRole: [{ value: 'collecting', count: 4 }],
      services: [{ value: 'letter_writing_nights', count: 2 }],
    })
    renderApp(<Groups />, { at: '/groups?country=Chile' })
    await screen.findByText('Lisbon ABC')
    // Spain has no group on this page, but the filters name it; Chile came with the link.
    expect(await screen.findByRole('link', { name: 'Spain' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Portugal' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Chile' }).getAttribute('aria-current')).toBe('true')
    // Only collecting groups exist, so there is no relay chip.
    expect(screen.getByRole('link', { name: 'Collecting letters' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Mailing relay' })).toBeNull()
    expect(fakeApi.callsTo('GET', '/chapter/filters')).toHaveLength(1)
  })
})
