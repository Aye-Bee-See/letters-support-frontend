import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getOne } from '../api/client'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { fakeApi, reply } from './fakeApi'
import { renderApp } from './render'
import { TEST_TOKEN } from './session'

// The test harness itself: a DOM, a seeded session, and the API faked at the client.

function Whoami() {
  const { user, isAuthenticated } = useAuth()
  const prisoner = useApi(() => getOne<{ name: string }>('/prisoner/prisoner', { id: 7 }), [])
  return (
    <p>
      {isAuthenticated ? `signed in as ${user?.username}` : 'signed out'}
      {prisoner.data && `, reading ${prisoner.data.name}`}
      {prisoner.error && `, refused ${prisoner.error.status}`}
    </p>
  )
}

describe('renderApp', () => {
  it('renders in a DOM, signed out by default, with the API faked', async () => {
    fakeApi.on('GET', '/prisoner/prisoner', { name: 'Sam' }, { params: { id: '7' } })
    const app = renderApp(<Whoami />, { at: '/somewhere' })
    expect(await screen.findByText('signed out, reading Sam')).toBeTruthy()
    expect(app.location().pathname).toBe('/somewhere')
    expect(fakeApi.calls).toHaveLength(1)
    expect(fakeApi.calls[0].authorization).toBeNull()
  })

  it('seeds a session before the first render, and the client carries its token', async () => {
    fakeApi.on('GET', '/prisoner/prisoner', reply.error(404, { name: 'NotFoundError' }))
    const app = renderApp(<Whoami />, { session: { role: 'user', user: { username: 'writer1' } } })
    expect(await screen.findByText('signed in as writer1, refused 404')).toBeTruthy()
    expect(app.auth().isWriter).toBe(true)
    expect(fakeApi.calls[0].authorization).toBe(`Bearer ${TEST_TOKEN}`)
  })

  it('fails a request nothing answers, and says which', async () => {
    renderApp(<Whoami />)
    expect(await screen.findByText('signed out, refused 0')).toBeTruthy()
    expect(fakeApi.unanswered.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /prisoner/prisoner'])
  })
})
