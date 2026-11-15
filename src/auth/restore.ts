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
// account banned) is forgotten, and the person signs in as before. If the API
// can't be reached the token is kept for the next load, and this load is
// signed out.

/** The remembered sign-in's account, asked for with its own token: no session exists yet to carry one. */
async function accountOf(id: number, token: string): Promise<User> {
  const response = await client.get<ApiEnvelope<User>>('/auth/user', { params: { id }, headers: { Authorization: `Bearer ${token}` } })
  return response.data.data
}

async function fromRememberedSignIn(): Promise<SharedSession | null> {
  const remembered = recallSignIn()
  if (!remembered) return null
  try {
    const [user, keys] = await Promise.all([accountOf(remembered.userId, remembered.token), getKeys(remembered.token)])
    if (user.id !== remembered.userId) throw new Error('The remembered sign-in names another account.')
    return {
      user,
      token: remembered.token,
      expires: remembered.expires,
      keys,
      keypair: null,
      groupKeypair: null,
      // Not known without signing in; the API's first refusal says so if it is (AuthContext).
      twoFactorSetupRequired: null,
    }
  } catch (err) {
    const status = toApiError(err).status
    // Unreachable or a fault on the server: the token may well still be good.
    if (status === 0 || status >= 500 || status === 429) return null
    // Only this token: another tab's session may have been taken over, and remembered, meanwhile.
    forgetSignIn(remembered.token)
    return null
  }
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
