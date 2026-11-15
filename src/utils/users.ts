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
        return 'This account is its group’s group-owner admin, and the group has other group admins. Ownership passes to one of them first: the owner does it on their group’s keys page, or a site admin on the group’s page here.'
      case 'last_key_holder':
        return 'This account is the last holder of its group’s key. Deleting it would leave the group unable to read its letters for ever: the key goes to another group admin first.'
      case 'anonymous':
        return 'This is a group’s shared anonymous account: it holds the anonymous letters of everyone the group wrote for, and goes only with the group.'
    }
  }
  return accountRefusal(error)
}

/**
 * Any other account call (role, group, revoke, two-factor reset). A role change
 * that would leave the site with no site admin is `409 RoleChangeError`
 * `last_admin` (`role_change.last_admin`, API #208). One that would take a
 * group's owner, or the last holder of its key, out of the group is the same
 * error with `group_owner` or `last_key_holder` (API #232): the pair
 * AccountDeleteError carries. `group` is the name of the group the account is
 * in now, to say which.
 */
export function accountRefusal(error: ApiError, group?: string): string {
  if (error.status === 409 && error.name === 'RoleChangeError') {
    const theirs = group ?? 'their group'
    switch (error.condition) {
      case 'last_admin':
        return 'Make another site admin first: this is the only site admin account, and the site always keeps one, or nobody could approve groups, moderate or make another site admin. Nothing was changed.'
      case 'group_owner':
        return `Pass ownership of ${theirs} to another group admin first: this account is its group-owner admin, and the group has other group admins. The owner does it on the group’s keys page, or a site admin on the group’s page here. Nothing was changed.`
      case 'last_key_holder':
        return `Hand ${theirs}’s key to another group admin first: this account is the last of its group admins to hold it, and without a holder the group could never read its letters again. The group-owner admin hands it over on the group’s keys page. Nothing was changed.`
    }
  }
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
 * PUT /auth/chapter-owner refusals, for a site admin choosing a group's owner
 * (README "Group keys" > "Ownership"). `409 OwnerError` `no_key`: the group has
 * a key and they don't hold it. `409 OwnerError` with no condition: the owner
 * changed meanwhile, or they are the owner already. A 400 on `user`: they have
 * stopped being a group admin of the group. `name` is the person chosen.
 */
export function ownerRefusal(error: ApiError, name: string): string {
  if (error.status === 409 && error.name === 'OwnerError') {
    return error.condition === 'no_key'
      ? `${name} needs the group key first: an owner without it couldn’t hand it on, take it back, or rotate it. The current owner hands it over on the group’s keys page. Nothing was changed.`
      : 'Someone else changed the owner just now. The list is up to date again: check who owns the group before trying once more.'
  }
  if (error.status === 400 && error.problems?.some((p) => p.field === 'user'))
    return `${name} isn’t a group admin of this group any more. The list is up to date again.`
  return accountRefusal(error)
}

/** A chapter-owner refusal that means the page's list is out of date and should be read again. */
export const ownerListStale = (error: ApiError) =>
  (error.status === 409 && error.name === 'OwnerError' && error.condition !== 'no_key') || error.status === 400 || error.status === 404
