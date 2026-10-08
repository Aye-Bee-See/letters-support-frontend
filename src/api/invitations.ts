// Invitations (/invitation): how groups join the network, and how a group adds
// members. Superadmins see and manage every invitation. The token is shown once,
// in the create or renew answer; the API stores only its hash and never sends it.
import { del, getList, getOne, post, PUBLIC, put } from './client'
import type { PasswordKeyFields, RecoveryKeyFields } from '../crypto'
import type { AccountStatus, Invitation, InvitationKind, InvitationStatus, ListParams, User } from '../types'

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

// Accepting (public): the invitee, with the token they were handed.

/** GET /invitation/invitation?token=: what a token invites its holder to. 404 unknown; 410 expired, accepted, revoked or inactive (condition). */
export interface InvitationInfo {
  kind: InvitationKind
  inviteeName: string
  /** The vouching group (kind group), or the group being joined (kind member); null when a superadmin invited directly. */
  chapter: { id: number; name: string } | null
  expiresAt: string
  /** What happens after accepting: `immediate`, or `admin_review` while a new group waits for a superadmin. */
  activation: 'immediate' | 'admin_review'
  /** The group fields the acceptance may send (kind group). */
  groupFields: string[]
}

export const getInvitationInfo = (token: string) => getOne<InvitationInfo>('/invitation/invitation', { token }, PUBLIC)

export interface AcceptRequest {
  token: string
  username: string
  email: string
  name?: string
  penName: string
  /** base64 auth key; sent as `password` with authScheme "split". */
  authKey: string
  keyFields: { publicKey: string } & PasswordKeyFields & RecoveryKeyFields
  /** Required for a group invitation, refused for a member one: the fields in InvitationInfo.groupFields. */
  group?: Record<string, unknown>
}

/** POST /invitation/accept: makes the account (role chapter) and, for a group invitation, the group. */
export const acceptInvitation = (req: AcceptRequest) =>
  post<{ user: User; chapter: { id: number; name: string; accountStatus: AccountStatus }; activation: 'immediate' | 'admin_review' }>(
    '/invitation/accept',
    {
      token: req.token,
      username: req.username,
      email: req.email,
      ...(req.name ? { name: req.name } : {}),
      penName: req.penName,
      authScheme: 'split',
      password: req.authKey,
      ...req.keyFields,
      ...(req.group ? { group: req.group } : {}),
    },
    undefined,
    PUBLIC,
  )
