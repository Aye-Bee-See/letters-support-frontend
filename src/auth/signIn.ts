import { getKeys, getLoginParams, login } from '../api/auth'
import { toApiError } from '../api/client'
import { signInKeys, unlockAccount, unlockGroupKey, wipe, type Keypair } from '../crypto'
import type { KeyBundle, LoginResult } from '../types'

// Signing in without sending the password (password-split-proposal §5, README
// "Signing in without sending the password"). The web client never sends a
// password: there is no `plain` path at all (decided 25 September). This module
// joins the API calls and the crypto; the Login page only collects input and
// shows the outcome.

export type SignInFailure =
  /** Wrong username or password (the API never says which). */
  | 'credentials'
  /** Too many attempts; see retryAfter. */
  | 'rate_limited'
  /** The server says this account still uses the old sign-in, which would send the password. Refused. */
  | 'plain_account'
  /** Signed in, but the private key would not open with this password. */
  | 'keys'
  /** The account has no keys. Every account must (owner's decision, 25 Sept), so this is refused. */
  | 'no_keys'
  | 'network'
  | 'other'

export class SignInError extends Error {
  readonly kind: SignInFailure
  readonly retryAfter?: number
  constructor(kind: SignInFailure, message: string, retryAfter?: number) {
    super(message)
    this.kind = kind
    this.retryAfter = retryAfter
  }
}

export interface SignedIn {
  result: LoginResult
  /** The account's key bundle (GET /auth/keys): wrapped keys only. */
  bundle: KeyBundle
  /** The account's keypair. Every account has one; a session never starts without it. */
  keypair: Keypair
  /** The group's keypair, for a group admin who has been handed the group key. */
  groupKeypair: Keypair | null
}

function fail(err: unknown): never {
  if (err instanceof SignInError) throw err
  const e = toApiError(err)
  if (e.status === 401) throw new SignInError('credentials', 'Incorrect username or password.')
  if (e.status === 429) throw new SignInError('rate_limited', 'Too many sign-in attempts.', e.retryAfter)
  if (e.status === 0) throw new SignInError('network', 'Could not reach the server.')
  throw new SignInError('other', e.message)
}

/**
 * Sign in and unlock the account's keys.
 *
 * 1. GET /auth/login-params: the scheme, salt and KDF parameters. Unknown
 *    usernames get a stable fake salt, so this reveals nothing.
 * 2. `plain`: refuse, sending nothing. `split`: derive wrapKey and authKey on
 *    the device (one Argon2id run) and send only authKey.
 * 3. POST /auth/login, then GET /auth/keys, and open the private key (and the
 *    group key) with wrapKey. wrapKey is wiped either way.
 * 4. An account without keys is refused: every account has keys, made when it
 *    is created (owner's decision, 25 September). There is no key set-up at
 *    sign-in.
 */
export async function signIn(username: string, password: string): Promise<SignedIn> {
  const name = username.trim()
  let wrapKey: Uint8Array | null = null
  try {
    const params = await getLoginParams(name).catch(fail)
    if (params.scheme !== 'split') {
      throw new SignInError(
        'plain_account',
        'This account still uses an older sign-in that sends your password to the server, which letters.support no longer does. ' +
          'Your password was not sent. Ask a network admin to move your account.',
      )
    }

    const keys = await signInKeys(password, params)
    wrapKey = keys.wrapKey
    const result = await login(name, keys.authKey).catch(fail)
    const bundle = result.keys ?? (await getKeys(result.token.token).catch(fail))

    if (!bundle.wrappedPrivateKey || !bundle.publicKey) {
      throw new SignInError('no_keys', "This account isn't fully set up, so it can't be used yet. Please contact a network admin.")
    }

    let keypair: Keypair
    try {
      keypair = await unlockAccount(bundle, wrapKey) // wipes wrapKey
      wrapKey = null
    } catch {
      throw new SignInError('keys', "Signed in, but we couldn't open your letters with this password. Try your recovery code.")
    }

    let groupKeypair: Keypair | null = null
    const org = bundle.orgKey
    if (org?.wrappedOrgPrivateKey && org.chapterPublicKey) {
      groupKeypair = await unlockGroupKey(
        { wrappedOrgPrivateKey: org.wrappedOrgPrivateKey, chapterPublicKey: org.chapterPublicKey },
        keypair,
      ).catch(() => null) // a stale hand-out must not block sign-in; the group key is handed out again later
    }

    return { result, bundle, keypair, groupKeypair }
  } finally {
    await wipe(wrapKey)
  }
}
