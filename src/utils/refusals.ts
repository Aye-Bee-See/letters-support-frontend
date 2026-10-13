import type { ApiError } from '../types'

// The refusals every group page words the same way (README "Errors"; the API's
// docs/ERRORS.md), so each page's own wording function adds only what is its
// own: a letter on hold, a recommendation already waiting, an invitation
// already accepted. Worded from status, `name` and `condition`, never from the
// API's sentence, which isn't stable and isn't written for the people here.

/**
 * The 403 a group admin gets when their group can't act: no group, or a group
 * that is pending or suspended (README "What each role can do"). The API sends
 * it as a plain AuthorizationError with no condition; refusals with a reason of
 * their own (`authorization.not_yours`, two-factor, owner-only) carry a
 * condition or another name. GroupGate keeps such a group's pages closed, so on
 * a page this means the group stopped being active since the page opened.
 */
export const isGroupNotActive = (error: ApiError) =>
  error.status === 403 && (error.name === 'AuthorizationError' || error.name === null) && error.condition === null

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** How long a 429 says to wait, in words. */
function waitFor(seconds: number | undefined): string {
  if (!seconds) return 'a moment'
  if (seconds < 90) return plural(Math.ceil(seconds), 'second')
  return plural(Math.ceil(seconds / 60), 'minute')
}

/**
 * The shared cases, or null for one the caller words itself: the server not
 * reached (status 0), a session that ended (401), a group that isn't active
 * (the 403 above), a record gone (404), a record changed meanwhile (409
 * `changed_meanwhile`), too many requests (429, with Retry-After), and a fault
 * on the server (5xx). A caller with a better word for one of these (a 404
 * that names the letter) says it before asking here.
 */
export function commonRefusal(error: ApiError): string | null {
  if (error.status === 0) return 'Couldn’t reach the server. Check your connection and try again.'
  if (error.status === 401) return 'Your session has ended. Sign in again, then try once more.'
  if (isGroupNotActive(error))
    return 'Your group can’t do this right now: only an active group can, and yours may be waiting for a site admin’s approval, or suspended.'
  if (error.status === 404) return 'That isn’t there any more: someone may have removed it meanwhile. Reload the page to see where things stand.'
  if (error.status === 409 && error.condition === 'changed_meanwhile')
    return 'Someone else changed this meanwhile, and nothing was saved. Reload the page and try again.'
  if (error.status === 429) return `Too many requests just now. Wait ${waitFor(error.retryAfter)} and try again.`
  if (error.status >= 500) return `Something went wrong on the server (${error.status}). Try again later.`
  return null
}

/**
 * The last word, when neither the caller nor commonRefusal has one: a 400's
 * first sentence (the API words those about the field, README "Errors"), else
 * a plain refusal with its status. Never the sentence of any other refusal.
 */
export function otherRefusal(error: ApiError): string {
  if (error.status === 400 && error.errors.length > 0) return error.errors[0]
  return `The server refused this (${error.status}). Reload the page and try again.`
}

/** commonRefusal, else otherRefusal: for a place with nothing of its own to add. */
export const refusalText = (error: ApiError) => commonRefusal(error) ?? otherRefusal(error)

/**
 * A site admin's write to the directory (the New prisoner, facility and group
 * pages): a 403 there is about the role, never commonRefusal's inactive group.
 */
export function siteAdminRefusal(error: ApiError): string {
  if (error.status === 403) return 'The server refused this: only a site admin can do it. Sign in again if your role changed.'
  return commonRefusal(error) ?? otherRefusal(error)
}
