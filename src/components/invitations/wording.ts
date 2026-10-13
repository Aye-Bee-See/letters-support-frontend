import type { ApiError, Invitation, InvitationKind } from '../../types'
import { commonRefusal, otherRefusal } from '../../utils/refusals'
import type { UiClasses } from '../forms/uiClasses'

// Shared by the invitation parts (README "Invitations"): kind labels,
// state badges, and refusals worded from the status, name and condition, never
// the API's sentence unless nothing else fits.

/** Asked before a create or renew while a code is on screen: it is shown once, and the new one replaces it. */
export const REPLACE_CODE_QUESTION = 'The code on screen is shown only now. Replace it?'

/** The site admin's page (/admin/invite). */
export const ADMIN_KIND_LABELS: Record<InvitationKind, string> = { group: 'New group', member: 'Group admin' }
/** A group admin's page (/settings/invitations): screens say "group admin", never "member". */
export const GROUP_KIND_LABELS: Record<InvitationKind, string> = { group: 'New group (vouched)', member: 'Group admin' }

type State = NonNullable<Invitation['state']>

/** The badge for an invitation's state, in the classes of the page it is on. */
export function stateBadge(c: UiClasses, state: State): string {
  const tone: Record<State, string> = { pending: c.badgeWait, expired: c.badgeBad, accepted: c.badgeGood, revoked: c.badgeBad }
  return `${c.badge} ${tone[state]}`
}

/**
 * Why creating, renewing or withdrawing an invitation was refused, worded from
 * the status, name and condition (README "Invitations", API #197). A 409
 * InvitationError says why in its condition: `inactive` (the vouching group is
 * not active), `accepted` or `revoked` (it is no longer pending), or
 * `changed_meanwhile` (an acceptance gave it back as this was asked: ask again).
 * An older API sent the family alone, so then what it means depends on what
 * was asked.
 */
export function invitationRefusal(err: ApiError, action: 'create' | 'renew' | 'withdraw'): string {
  if (err.status === 400 && err.errors?.length) return err.errors.join(' ')
  const verb = action === 'renew' ? 'renewed' : action === 'withdraw' ? 'withdrawn' : 'made'
  if (err.status === 409 && err.name === 'InvitationError') {
    if (err.condition === 'inactive')
      return 'That group isn’t an active member of the network (it may be waiting for approval or suspended), so it can’t vouch or take new group admins.'
    if (err.condition === 'accepted') return `This invitation has already been accepted, so it can’t be ${verb}. Reload the page.`
    if (err.condition === 'revoked')
      return action === 'withdraw' ? 'This invitation was already withdrawn. Reload the page.' : `This invitation was withdrawn, so it can’t be ${verb}. Reload the page.`
    if (err.condition === 'changed_meanwhile') return `The invitation changed while this was asked, and nothing was ${verb}. Try again.`
  }
  if (err.status === 409)
    return action === 'create'
      ? 'That group isn’t an active member of the network, so it can’t vouch or take new group admins.'
      : `Only a pending invitation can be ${verb}: this one was already accepted or withdrawn.`
  if (err.status === 404) return 'That invitation isn’t there any more. Reload the page.'
  // A 403 is a group that isn't active: a group sees and changes only its own invitations.
  return commonRefusal(err) ?? otherRefusal(err)
}
