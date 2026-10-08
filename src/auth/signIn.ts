import { getKeys, getLoginParams, isTwoFactorChallenge, login, logout } from '../api/auth'
import { loginTwoFactor, type SecondFactor } from '../api/twoFactor'
import { toApiError } from '../api/client'
import { KdfParamsError, signInKeys, unlockAccount, unlockGroupKey, wipe, type Keypair } from '../crypto'
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
  /** The server named key derivation costs below the agreed ones (KDF_PARAMS). Refused before sending anything. */
  | 'weak_params'
  /** The server named costs above what this client runs (KDF_MAX). Refused before sending anything. */
  | 'heavy_params'
  /** Second step: the authenticator or recovery code was wrong. The challenge is still good. */
  | 'wrong_code'
  /** Second step: the challenge expired or was used. Start again from the password. */
  | 'challenge_expired'
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

/**
 * The wording for a recovery or claim code refused before use because the
 * server named key derivation costs out of bounds (KdfParamsError); null for
 * any other error. The sign-in page words its own (weak_params, heavy_params).
 */
export function codeParamsRefusal(err: unknown): string | null {
  if (!(err instanceof KdfParamsError)) return null
  return err.kind === 'weak'
    ? 'This server asked for weaker protection for your code than this site uses, so your code was not used. Please tell a network admin.'
    : 'This server asked for more work than this browser can safely do, so your code was not used. Please tell a network admin.'
}

/** The password was right and the account uses two-factor sign-in: ask for a code, then call signIn again with it. */
export interface CodeNeeded {
  codeNeeded: true
  challenge: string
  expiresAt: string
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
 * Revoke a token no session will use (POST /auth/logout), without waiting: a
 * sign-in refused after the API issued it. Best effort; a failure changes
 * nothing for the person, and the token expires within a week regardless.
 */
export function revoke(token: string): void {
  Promise.resolve()
    .then(() => logout(token))
    .catch(() => null)
}

/** The second step's failures: a wrong code leaves the challenge usable; an expired or used one does not. */
function failCode(err: unknown): never {
  const e = toApiError(err)
  if (e.status === 400) throw new SignInError('wrong_code', 'That code didn’t work. Check it and try again.')
  if (e.status === 401) throw new SignInError('challenge_expired', 'That took too long. Sign in again from the start.')
  return fail(err)
}

/**
 * Sign in and unlock the account's keys.
 *
 * 1. GET /auth/login-params: the scheme, salt and KDF parameters. Unknown
 *    usernames get a stable fake salt, so this reveals nothing.
 * 2. `plain`: refuse, sending nothing. `split`: derive wrapKey and authKey on
 *    the device (one Argon2id run) and send only authKey. Costs below the
 *    agreed ones, or above the cap, are refused, sending nothing.
 * 3. POST /auth/login. For an account with two-factor sign-in on, that answers
 *    only a challenge: return CodeNeeded, and the caller calls again with the
 *    challenge and a code (POST /auth/login/two-factor).
 * 4. GET /auth/keys (or the bundle the sign-in answered with), and open the
 *    private key (and the group key) with wrapKey. wrapKey is wiped either way.
 * 5. An account without keys is refused: every account has keys, made when it
 *    is created (owner's decision, 25 September). There is no key set-up at
 *    sign-in.
 */
export async function signIn(
  username: string,
  password: string,
  second?: { challenge: string; factor: SecondFactor },
): Promise<SignedIn | CodeNeeded> {
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

    // The second step derives the keys again (a second or so) rather than holding
    // wrapKey in memory while the person fetches their code.
    // Costs outside the agreed bounds are refused here, before anything derived
    // from the password exists, let alone is sent (see checkKdfParams).
    const keys = await signInKeys(password, params).catch((err: unknown) => {
      if (err instanceof KdfParamsError) {
        throw new SignInError(err.kind === 'weak' ? 'weak_params' : 'heavy_params', err.message)
      }
      throw err
    })
    wrapKey = keys.wrapKey
    let result: LoginResult
    if (second) {
      result = await loginTwoFactor(second.challenge, second.factor).catch(failCode)
    } else {
      const answer = await login(name, keys.authKey).catch(fail)
      if (isTwoFactorChallenge(answer)) return { codeNeeded: true, ...answer.twoFactor }
      result = answer
    }
    try {
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
    } catch (err) {
      // The API issued a token, but no session starts with it: end it on the
      // server too (best effort; it would otherwise stay good for a week).
      revoke(result.token.token)
      throw err
    }
  } finally {
    await wipe(wrapKey)
  }
}
