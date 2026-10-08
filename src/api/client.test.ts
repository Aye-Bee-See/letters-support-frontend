import { describe, expect, it } from 'vitest'
import { authorizationFor, endsSession } from './client'

// Which token a request carries, and which 401 ends the session.

describe('the Authorization header', () => {
  it('carries the session’s token by default', () => {
    expect(authorizationFor({}, 'session')).toBe('Bearer session')
  })

  it('a public sign-in call goes without it', () => {
    expect(authorizationFor({ skipAuth: true }, 'session')).toBeNull()
  })

  it('a request naming its own token keeps it', () => {
    expect(authorizationFor({ own: 'Bearer new-account' }, 'session')).toBe('Bearer new-account')
  })

  it('no session, no header', () => {
    expect(authorizationFor({}, null)).toBeNull()
  })
})

describe('a 401 ends the session', () => {
  it('when the request carried the session’s token', () => {
    expect(endsSession(401, 'Bearer session', 'session')).toBe(true)
  })

  it('not for a public call that carried none (a wrong password while signed in)', () => {
    expect(endsSession(401, undefined, 'session')).toBe(false)
  })

  it('not for a token named for another account, or one this session has since replaced', () => {
    expect(endsSession(401, 'Bearer new-account', 'session')).toBe(false)
    expect(endsSession(401, 'Bearer before-the-password-change', 'session')).toBe(false)
  })

  it('not for other statuses, nor without a session', () => {
    expect(endsSession(403, 'Bearer session', 'session')).toBe(false)
    expect(endsSession(401, 'Bearer session', null)).toBe(false)
  })
})
