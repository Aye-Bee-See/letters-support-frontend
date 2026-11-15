// The sign-in this tab remembers across a reload (issue #76): the API token,
// when it expires, and whose it is. Never a key: the private key stays wrapped
// under the password on the server, and an unlocked one lives in memory only.
//
// sessionStorage, not localStorage: it survives a reload and goes with the tab,
// and no other window reads it, so closing every tab still signs the person out
// and a shared computer isn't left signed in for the token's week. Script
// running on the page could read the token. That gives API access as the
// account, and in end-to-end mode opens no letter: those need the keys.

const KEY = 'paperkites-session'

export interface RememberedSignIn {
  token: string
  /** Token expiry, Unix ms. */
  expires: number
  userId: number
}

/** The tab's storage, or null where there is none (blocked, or not a browser). */
function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/** Keep this sign-in for the tab's next load. Best effort: storage may be full or blocked. */
export function rememberSignIn(signIn: RememberedSignIn): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ token: signIn.token, expires: signIn.expires, userId: signIn.userId }))
  } catch {
    // Not remembered: a reload signs out, as it did before.
  }
}

/**
 * Forget it: on signing out, and when the token turns out to be over. With
 * `onlyToken`, only if that is still the token remembered: a refusal of an old
 * token must not forget a session that began meanwhile.
 */
export function forgetSignIn(onlyToken?: string): void {
  try {
    const store = storage()
    if (!store) return
    if (onlyToken !== undefined) {
      const raw = store.getItem(KEY)
      const current = raw ? (JSON.parse(raw) as { token?: unknown } | null) : null
      if (current && current.token !== onlyToken) return
    }
    store.removeItem(KEY)
  } catch {
    // Nothing to remove, or nowhere to remove it from; or what is there isn't ours to read, and stays.
  }
}

/**
 * The sign-in this tab remembers, or null. One that has expired, or isn't in
 * the shape this code writes, is dropped rather than tried.
 */
export function recallSignIn(now = Date.now()): RememberedSignIn | null {
  let raw: string | null
  try {
    raw = storage()?.getItem(KEY) ?? null
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const value = JSON.parse(raw) as Partial<RememberedSignIn> | null
    if (
      value &&
      typeof value.token === 'string' &&
      value.token !== '' &&
      typeof value.expires === 'number' &&
      value.expires > now &&
      typeof value.userId === 'number' &&
      Number.isInteger(value.userId)
    ) {
      return { token: value.token, expires: value.expires, userId: value.userId }
    }
  } catch {
    // Not JSON: dropped below.
  }
  forgetSignIn()
  return null
}
