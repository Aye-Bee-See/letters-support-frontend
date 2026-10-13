import type { Location } from 'react-router-dom'
import type { UserRole } from '../../types'

// The paths the route guards send people to, and where someone goes once
// signed in or past a step (RouteGuards.tsx, Login, PenName).

/** Where two-factor sign-in is set up; while it's required and not set up, the only page that works. */
export const SECURITY_PATH = '/account/security'
/** Where a writer without a pen name chooses one. */
export const PEN_NAME_PATH = '/account/pen-name'

/** Pages that are steps on the way in, never where someone was going. */
const NOT_DESTINATIONS = ['/login', PEN_NAME_PATH, SECURITY_PATH]

/**
 * Where to go once signed in or past a step: where the person was going, unless
 * that was itself a step (a guard can fire while they are still on /login),
 * else `fallback`.
 */
export function destination(from: Location | null | undefined, fallback: string): string {
  if (!from || NOT_DESTINATIONS.includes(from.pathname)) return fallback
  return `${from.pathname}${from.search}${from.hash}`
}

/** Where each role starts. */
export function homeFor(role: UserRole): string {
  if (role === 'admin') return '/admin'
  // A banned account can't sign in (the API refuses it, and ends its sessions),
  // so this shouldn't arise; but /inbox would refuse it in turn, so not there.
  if (role === 'banned') return '/'
  return '/inbox'
}
