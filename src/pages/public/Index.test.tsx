import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeApi, reply } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import Index from './Index'

// The front page's news panel is there only when there is news: with the API's
// news switched off (GET /news answers an empty list) or out of reach, a "News
// from" heading over nothing would read as broken. The API is faked.

const item = {
  title: 'Political Prisoner updates',
  url: 'https://www.abcf.net/blog/updates/',
  date: '2026-11-11T12:00:00.000Z',
  summary: 'This week’s updates.',
}

const noPrisoners = () => fakeApi.on('GET', '/prisoner/prisoners', reply.list([]))

describe('Index news panel', () => {
  it('shows the panel beside the text when the API has news', async () => {
    noPrisoners()
    fakeApi.on('GET', '/news', [item])
    const { container } = renderApp(<Index />)

    expect(await screen.findByRole('link', { name: 'Political Prisoner updates' })).toBeTruthy()
    expect(screen.getByText('News from')).toBeTruthy()
    expect(container.querySelector('.splash-two-col')).not.toBeNull()
  })

  it('leaves the panel out, and the second column with it, when there is none', async () => {
    noPrisoners()
    fakeApi.on('GET', '/news', [])
    const { container } = renderApp(<Index />)

    // The column is kept while the answer is on its way, then closes up.
    expect(container.querySelector('.splash-two-col')).not.toBeNull()
    await waitFor(() => expect(container.querySelector('.splash-two-col')).toBeNull())
    expect(screen.queryByText('News from')).toBeNull()
    expect(container.querySelector('.feed-panel')).toBeNull()
    expect(screen.getByRole('link', { name: 'Browse prisoners' })).toBeTruthy()
  })

  it('leaves the panel out when the news can’t be fetched', async () => {
    noPrisoners()
    fakeApi.on('GET', '/news', reply.error(500))
    const { container } = renderApp(<Index />)

    await waitFor(() => expect(container.querySelector('.splash-two-col')).toBeNull())
    expect(screen.queryByText('News from')).toBeNull()
  })
})
