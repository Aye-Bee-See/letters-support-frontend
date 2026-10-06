import type { ApiError, Invitation, InvitationKind } from '../../types'
import type { UiClasses } from '../forms/uiClasses'

// Shared by the invitation parts (README "Invitations"): dates, kind labels,
// state badges, and refusals worded from the status and name, never the API's
// sentence unless nothing else fits.

export const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The site admin's page (/admin/invite). */
export const ADMIN_KIND_LABELS: Record<InvitationKind, string> = { group: 'New group', member: 'Group member' }
/** A group admin's page (/settings/invitations): screens say "group admin", never "member". */
export const GROUP_KIND_LABELS: Record<InvitationKind, string> = { group: 'New group (vouched)', member: 'Group admin' }

type State = NonNullable<Invitation['state']>

/** The badge for an invitation's state, in the classes of the page it is on. */
export function stateBadge(c: UiClasses, state: State): string {
  const tone: Record<State, string> = { pending: c.badgeWait, expired: c.badgeBad, accepted: c.badgeGood, revoked: c.badgeBad }
  return `${c.badge} ${tone[state]}`
}

/**
 * Why creating, renewing or withdrawing an invitation was refused. Every 409
 * is an InvitationError with no condition, so what it means depends on what
 * was asked (README "Invitations").
 */
export function invitationRefusal(err: ApiError, action: 'create' | 'renew' | 'withdraw'): string {
  if (err.errors?.length) return err.errors.join(' ')
  if (err.status === 403)
    return action === 'create'
      ? 'Only an active group can invite, and only on its own behalf.'
      : 'Only the inviting group or a site admin can change this invitation.'
  if (err.status === 409)
    return action === 'create'
      ? 'That group isn’t an active member of the network, so it can’t vouch or take new group admins.'
      : `Only a pending invitation can be ${action === 'renew' ? 'renewed' : 'withdrawn'}: this one was already accepted or withdrawn.`
  if (err.status === 404) return 'That invitation isn’t there any more. Reload the page.'
  return err.message
}
