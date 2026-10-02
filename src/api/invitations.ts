// Invitations (/invitation): how groups join the network, and how a group adds
// members. Superadmins see and manage every invitation. The token is shown once,
// in the create or renew answer; the API stores only its hash and never sends it.
import { del, getList, post, put } from './client'
import type { Invitation, InvitationKind, InvitationStatus, ListParams } from '../types'

export interface InvitationInput {
  kind: InvitationKind
  /** Who or what is being invited. Required. */
  inviteeName: string
  /** Private notes for the inviting group and admins; never shown to the invitee. */
  inviteeEmail?: string
  note?: string
  /** Admins: the vouching group (kind group; omit for nobody) or the group being joined (kind member; required). */
  chapter?: number
}

export const createInvitation = (input: InvitationInput) => post<Invitation>('/invitation/invitation', input)

/** `status` is the stored one (pending, accepted, revoked); rows carry `state`, which also says `expired`. */
export const getInvitations = (params?: ListParams & { status?: InvitationStatus; kind?: InvitationKind; chapter?: number }) =>
  getList<Invitation>('/invitation/invitations', params)

/** A fresh token and expiry for a pending invitation (expired ones too); the old token stops working. */
export const renewInvitation = (id: number) => put<Invitation>('/invitation/invitation', { id })

/** Withdraw a pending invitation. A 409 for one already accepted or withdrawn. */
export const withdrawInvitation = (id: number) => del<Invitation>('/invitation/invitation', { id })
