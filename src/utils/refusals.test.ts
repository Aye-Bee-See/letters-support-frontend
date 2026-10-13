import { describe, expect, it } from 'vitest'
import type { ApiError } from '../types'
import { blockRefusal } from './blocks'
import { statusRefusal } from './groupLetters'
import { commonRefusal, isGroupNotActive, otherRefusal, refusalText, siteAdminRefusal } from './refusals'
import { describeWriterError } from '../groups/writers'
import { linkRefusal } from '../components/group/useLinkAction'
import { invitationRefusal } from '../components/invitations/wording'

const SENTENCE = 'The API’s own sentence, not stable.'
const refusal = (over: Partial<ApiError>): ApiError => ({ status: 400, name: null, condition: null, errors: [], message: SENTENCE, ...over })
const inactive = refusal({ status: 403, name: 'AuthorizationError' })

describe('siteAdminRefusal', () => {
  it('words a 403 by role, never as an inactive group, and the rest as everywhere', () => {
    expect(siteAdminRefusal(inactive)).toMatch(/only a site admin/)
    expect(siteAdminRefusal(refusal({ errors: ['Routing must be one of direct.'] }))).toBe('Routing must be one of direct.')
  })
})

describe('commonRefusal', () => {
  it('words the server not reached, and a session that ended', () => {
    expect(commonRefusal(refusal({ status: 0 }))).toMatch(/^Couldn’t reach the server/)
    expect(commonRefusal(refusal({ status: 401, name: 'AuthenticationError' }))).toMatch(/^Your session has ended/)
  })

  it('words the 403 of a group that isn’t active, and only that 403', () => {
    expect(isGroupNotActive(inactive)).toBe(true)
    expect(commonRefusal(inactive)).toMatch(/^Your group can’t do this right now: only an active group can/)
    // A 403 with a reason of its own is the caller's to word.
    expect(isGroupNotActive(refusal({ status: 403, name: 'AuthorizationError', condition: 'not_yours' }))).toBe(false)
    expect(commonRefusal(refusal({ status: 403, name: 'TwoFactorRequiredError', condition: 'setup_required' }))).toBeNull()
  })

  it('words a record gone, and one changed meanwhile', () => {
    expect(commonRefusal(refusal({ status: 404, name: 'NotFoundError' }))).toMatch(/isn’t there any more/)
    expect(commonRefusal(refusal({ status: 409, name: 'InvitationError', condition: 'changed_meanwhile' }))).toMatch(/changed this meanwhile/)
    expect(commonRefusal(refusal({ status: 409, name: 'InvitationError', condition: 'accepted' }))).toBeNull()
  })

  it('says how long to wait after a 429', () => {
    expect(commonRefusal(refusal({ status: 429, name: 'RateLimitError' }))).toBe('Too many requests just now. Wait a moment and try again.')
    expect(commonRefusal(refusal({ status: 429, name: 'RateLimitError', retryAfter: 1 }))).toContain('Wait 1 second and')
    expect(commonRefusal(refusal({ status: 429, name: 'RateLimitError', retryAfter: 30 }))).toContain('Wait 30 seconds')
    expect(commonRefusal(refusal({ status: 429, name: 'RateLimitError', retryAfter: 600 }))).toContain('Wait 10 minutes')
  })

  it('words a fault on the server with its status', () => {
    expect(commonRefusal(refusal({ status: 503 }))).toBe('Something went wrong on the server (503). Try again later.')
  })

  it('leaves the rest to the caller', () => {
    expect(commonRefusal(refusal({ status: 400, errors: ['x is required.'] }))).toBeNull()
    expect(commonRefusal(refusal({ status: 409, name: 'KeyVersionError' }))).toBeNull()
  })
})

describe('otherRefusal', () => {
  it('shows a 400’s first sentence, and never the sentence of another refusal', () => {
    expect(otherRefusal(refusal({ status: 400, errors: ['label is too long.', 'days must be 1 to 30.'] }))).toBe('label is too long.')
    expect(otherRefusal(refusal({ status: 422, name: 'SomethingNewError' }))).toBe('The server refused this (422). Reload the page and try again.')
    expect(refusalText(refusal({ status: 409, name: 'SomethingNewError' }))).not.toContain(SENTENCE)
  })
})

describe('the wording functions share the common cases', () => {
  const all = [
    (e: ApiError) => statusRefusal(e, [41], 'printed'),
    (e: ApiError) => blockRefusal(e, 'block'),
    (e: ApiError) => describeWriterError(e),
    linkRefusal,
    (e: ApiError) => invitationRefusal(e, 'create'),
  ]

  it('word a group that isn’t active the same way', () => {
    for (const word of all) expect(word(inactive)).toMatch(/^Your group can’t do this right now: only an active group can/)
  })

  it('never show the API’s sentence for a refusal with a name', () => {
    for (const word of all)
      for (const e of [refusal({ status: 0 }), refusal({ status: 429, name: 'RateLimitError' }), refusal({ status: 500 }), refusal({ status: 422, name: 'SomethingNewError' })])
        expect(word(e)).not.toContain(SENTENCE)
  })

  it('keep the browser’s own sentence for a writer key that won’t open', () => {
    expect(describeWriterError(new Error('This writer’s key is locked with a newer group key.'))).toBe('This writer’s key is locked with a newer group key.')
  })
})
