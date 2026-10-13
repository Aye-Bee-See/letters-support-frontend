import type { Location } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { destination, homeFor } from './paths'

const at = (pathname: string, search = '', hash = ''): Location => ({ pathname, search, hash, state: null, key: 'k' })

describe('destination', () => {
  it('goes back where the person was going, query and hash included', () => {
    expect(destination(at('/admin/queue', '?status=pending', '#top'), '/admin')).toBe('/admin/queue?status=pending#top')
  })
  it('never to a step on the way in: sign-in, pen name, two-factor set-up', () => {
    for (const step of ['/login', '/account/pen-name', '/account/security']) expect(destination(at(step), '/inbox')).toBe('/inbox')
  })
  it('falls back with nowhere to go', () => {
    expect(destination(undefined, '/inbox')).toBe('/inbox')
  })
})

describe('homeFor', () => {
  it('sends each role to its own start', () => {
    expect(homeFor('admin')).toBe('/admin')
    expect(homeFor('chapter')).toBe('/inbox')
    expect(homeFor('user')).toBe('/inbox')
    expect(homeFor('banned')).toBe('/')
  })
})
