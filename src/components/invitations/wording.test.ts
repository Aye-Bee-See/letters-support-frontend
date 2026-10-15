import { describe, expect, it } from 'vitest'
import type { ApiError } from '../../types'
import { invitationRefusal } from './wording'

const refusal = (over: Partial<ApiError>): ApiError => ({ status: 409, name: 'InvitationError', condition: null, errors: [], message: 'Not stable English.', ...over })

describe('invitationRefusal (README "Invitations")', () => {
  it('words the 409 conditions', () => {
    expect(invitationRefusal(refusal({ condition: 'inactive' }), 'create')).toMatch(/^That group isn’t an active member/)
    expect(invitationRefusal(refusal({ condition: 'accepted' }), 'renew')).toBe('This invitation has already been accepted, so it can’t be renewed. Reload the page.')
    expect(invitationRefusal(refusal({ condition: 'revoked' }), 'renew')).toBe('This invitation was withdrawn, so it can’t be renewed. Reload the page.')
    expect(invitationRefusal(refusal({ condition: 'revoked' }), 'withdraw')).toBe('This invitation was already withdrawn. Reload the page.')
    expect(invitationRefusal(refusal({ condition: 'changed_meanwhile' }), 'renew')).toMatch(/nothing was renewed\. Try again\.$/)
  })

  it('falls back on what was asked when the API sent the family alone', () => {
    expect(invitationRefusal(refusal({}), 'create')).toMatch(/can’t vouch/)
    expect(invitationRefusal(refusal({}), 'renew')).toBe('Only a pending invitation can be renewed: this one was already accepted or withdrawn.')
    expect(invitationRefusal(refusal({ condition: 'something_new' }), 'withdraw')).toMatch(/^Only a pending invitation can be withdrawn/)
  })

  it('never words a refusal from the sentence when anything else fits', () => {
    expect(invitationRefusal(refusal({ status: 404, name: 'NotFoundError' }), 'renew')).toContain('isn’t there any more')
    expect(invitationRefusal(refusal({ status: 400, errors: ['days must be 1 to 30.'] }), 'renew')).toBe('days must be 1 to 30.')
    expect(invitationRefusal(refusal({ status: 403, name: 'AuthorizationError', condition: 'group_pending' }), 'create')).toMatch(/^Your group is still waiting/)
    expect(invitationRefusal(refusal({ status: 409, name: 'SomethingNewError' }), 'create')).not.toContain('Not stable English')
    expect(invitationRefusal(refusal({ status: 422, name: 'SomethingNewError' }), 'renew')).not.toContain('Not stable English')
  })
})
