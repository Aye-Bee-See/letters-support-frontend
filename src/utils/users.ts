import type { ApiError, User, UserRole } from '../types'
import { commonRefusal, otherRefusal } from './refusals'

// Accounts as a site admin sees them (pages/admin/Users.tsx, EditUser.tsx,
// NewAccount.tsx): the roles in the screens' own words (README "Who uses it"),
// and the refusals of the account calls worded from `name` and `condition`.

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'writer',
  chapter: 'group admin',
  admin: 'site admin',
  banned: 'banned',
}

export const ROLES = Object.keys(ROLE_LABELS) as UserRole[]

export const isRole = (value: string | null): value is UserRole => value !== null && ROLES.includes(value as UserRole)

/** The name to call an account by: its name, else its username. */
export const accountName = (u: Pick<User, 'name' | 'username'>) => u.name || u.username

/**
 * What a site admin can't do to this account, said before they try, or null.
 * A group's shared anonymous account and an unclaimed managed writer are the
 * group's to look after; nobody signs in to them.
 */
export function managedNote(u: Pick<User, 'anonymousForChapter' | 'managedBy' | 'claimedAt'>): string | null {
  if (u.anonymousForChapter !== null) return 'This is a group’s shared anonymous account: it holds the letters of everyone the group writes for anonymously. Nobody signs in to it.'
  if (u.managedBy !== null && !u.claimedAt) return 'This is a writer a group looks after (a managed writer who hasn’t claimed the account). Nobody signs in to it until they claim it.'
  return null
}

/**
 * DELETE /auth/user refusals (README "DELETE /auth/user"; `409
 * AccountDeleteError`, conditions from the API's erase-account.js).
 */
export function deleteRefusal(error: ApiError): string {
  if (error.status === 409 && error.name === 'AccountDeleteError') {
    switch (error.condition) {
      case 'only_admin':
        return 'This is the only site admin account. Make another account a site admin first, or nobody could run the site.'
      case 'group_owner':
        return 'This account is its group’s group-owner admin, and the group has other group admins. Ownership passes to one of them first: the owner does it on their group’s keys page.'
      case 'last_key_holder':
        return 'This account is the last holder of its group’s key. Deleting it would leave the group unable to read its letters for ever: the key goes to another group admin first.'
      case 'anonymous':
        return 'This is a group’s shared anonymous account: it holds the anonymous letters of everyone the group wrote for, and goes only with the group.'
    }
  }
  return accountRefusal(error)
}

/** Any other account call (role, group, revoke, two-factor reset). */
export function accountRefusal(error: ApiError): string {
  if (error.status === 409 && error.name === 'TwoFactorError' && error.condition === 'not_enabled')
    return 'Two-factor sign-in isn’t on for this account, so there is nothing to reset.'
  if (error.status === 409 && error.name === 'KeyChangeError')
    return 'This writer’s key is sealed to the group that looks after them, so they can’t be moved: they claim the account, or that group hands them over.'
  if (error.status === 403) return 'The server refused this: only a site admin can change accounts. Sign in again if your role changed.'
  if (error.status === 404) return 'There is no such account any more: it may have been deleted meanwhile.'
  return commonRefusal(error) ?? otherRefusal(error)
}

/**
 * POST /auth/user refusals. A taken username or email comes back as a general
 * error whose sentence is the only thing that says which (README "POST
 * /auth/user"), so a 400 shows the API's own sentence as every 400 does.
 */
export function createRefusal(error: ApiError): string {
  if (error.status === 403) return 'The server refused this: only a site admin can make staff accounts.'
  return commonRefusal(error) ?? otherRefusal(error)
}

/**
 * Any other site-admin write (the directory records made on the New pages): a
 * 403 there is about the role, never commonRefusal's inactive group.
 */
export function siteAdminRefusal(error: ApiError): string {
  if (error.status === 403) return 'The server refused this: only a site admin can do it. Sign in again if your role changed.'
  return commonRefusal(error) ?? otherRefusal(error)
}
