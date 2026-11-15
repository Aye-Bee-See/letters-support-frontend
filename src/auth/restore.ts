import client, { toApiError } from '../api/client'
import { getKeys } from '../api/auth'
import type { ApiEnvelope, User } from '../types'
import { askOtherTabs, type SharedSession } from './sessionChannel'
import { forgetSignIn, recallSignIn } from './sessionStore'

// Finding a session when the site opens with none (issue #76), in order:
//
// 1. Another tab that is signed in hands its own over, keys and all
//    (sessionChannel.ts). A new tab or window is then simply signed in.
// 2. Else the sign-in this tab remembers from before a reload
//    (sessionStore.ts): the token, with the account and its key bundle read
//    again from the API. No password was typed, so nothing is unlocked: the
//    session is signed in and LOCKED (`keypair` null) until the person gives
//    their password to a page that needs the keys (components/layout/UnlockGate).
//
// A remembered token the API no longer takes (a 401: expired, revoked, the
// account banned) is forgotten, and the person signs in as before. Any other
// failure keeps the token for the next load, and this load is signed out.

/** The remembered sign-in's account, asked for with its own token: no session exists yet to carry one. */
async function accountOf(id: number, token: string): Promise<User> {
  const response = await client.get<ApiEnvelope<User>>('/auth/user', { params: { id }, headers: { Authorization: `Bearer ${token}` } })
  return response.data.data
}

async function fromRememberedSignIn(): Promise<SharedSession | null> {
  const remembered = recallSignIn()
  if (!remembered) return null
  // Both answers are waited for: a 401 from either says the token is over, whichever failed first and however the other failed.
  const [account, bundle] = await Promise.allSettled([accountOf(remembered.userId, remembered.token), getKeys(remembered.token)])
  if (account.status === 'fulfilled' && bundle.status === 'fulfilled' && account.value.id === remembered.userId) {
    return {
      user: account.value,
      token: remembered.token,
      expires: remembered.expires,
      keys: bundle.value,
      keypair: null,
      groupKeypair: null,
      // Both reads were answered, and the API answers neither to an account that
      // must still set up two-factor sign-in (see below): so it need not.
      twoFactorSetupRequired: null,
    }
  }
  const refusedAs = (status: number) => [account, bundle].some((r) => r.status === 'rejected' && toApiError(r.reason).status === status)
  // Only a 401 says the token itself is over (expired, revoked, the account
  // banned): forgotten, unless a session that began meanwhile is remembered now.
  if (refusedAs(401)) forgetSignIn(remembered.token)
  // Anything else leaves it for the next load: the API out of reach or at
  // fault, too many requests, or a 403. An account that must set up two-factor
  // sign-in is refused these two reads (the API answers such a session only for
  // setting it up and signing out), so it can't be restored: the person signs
  // in, and the sign-in takes them to set it up.
  return null
}

/**
 * The session to start with, or null to start signed out. Never throws.
 *
 * Both are tried at once, so a reload doesn't wait out the other tabs' silence
 * before reading the remembered sign-in: an unlocked session from another tab
 * wins the moment it is offered; else the remembered sign-in, read meanwhile;
 * else a locked session another tab offered. `stillNeeded` says whether the tab
 * is still without a session: one that began before this was called stands, and
 * the remembered sign-in, which by then is that session's own, isn't tried.
 */
export async function restoreSession(stillNeeded: () => boolean = () => true): Promise<SharedSession | null> {
  try {
    const remembered = stillNeeded() ? fromRememberedSignIn() : Promise.resolve(null)
    const shared = await askOtherTabs()
    if (shared?.keypair) return shared
    return (await remembered) ?? shared
  } catch {
    return null
  }
}
