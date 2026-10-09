import type { User, UserRole } from '../types'

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
