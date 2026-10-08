import { getKeys, joinWithCode, loginNewAccount } from '../api/auth'
import { toApiError } from '../api/client'
import { createAccountKeys } from '../crypto'
import type { ApiError } from '../types'
import { revoke, type SignedIn } from './signIn'

// Joining with an invite code (README "Invite codes"; 22 Sept note §3). The
// account and its keys are made together: the keypair is generated on the
// device, the private key is locked under the password (split scheme) and
// under a new recovery code, and only locked copies go to the API. Then the
// new account signs in with the auth key already derived, so the password is
// not run through Argon2id twice.
//
// Making the account and signing in are two steps. Once the account is made,
// its recovery code exists nowhere else and the invite code is spent, so a
// failure from then on (a 429, a 5xx, a dropped connection) is returned, not
// thrown: the code is still shown, and the person signs in with their password
// afterwards. Only a failure before the account exists throws.

export interface Joined {
  /**
   * null when the account (or the new password) is saved but the person is not
   * signed in: after a recovery for an account with two-factor sign-in on
   * (signInError null: signing in also needs a code), or when the sign-in that
   * follows failed (signInError says why). Either way they sign in again.
   */
  signedIn: SignedIn | null
  /** Why signing in after the account was made failed; null if it didn't. */
  signInError: ApiError | null
  /** Show once; the person must confirm they saved it before continuing. */
  recoveryCode: string
}

/**
 * The sign-in that follows a write which made an account or set a password.
 * Its failure is returned rather than thrown: the write cannot be repeated,
 * and its recovery code must still reach the person. `signIn` passes the token
 * to `issued` as soon as it has one: if it fails after that (fetching the
 * keys), no session will use the token, so it is revoked.
 */
export async function signInAfterWrite(
  signIn: (issued: (token: string) => void) => Promise<SignedIn | null>,
): Promise<Pick<Joined, 'signedIn' | 'signInError'>> {
  let token: string | null = null
  try {
    return { signedIn: await signIn((t) => (token = t)), signInError: null }
  } catch (err) {
    if (token) revoke(token)
    return { signedIn: null, signInError: toApiError(err) }
  }
}

/**
 * Make the account, then sign in. Throws only while the account is not made:
 * the API's errors (see toApiError), 400 with `errors`, 404/410 for the code.
 */
export async function join(input: { code: string; username: string; penName: string; password: string }): Promise<Joined> {
  const account = await createAccountKeys(input.password)
  const username = input.username.trim()
  await joinWithCode({
    code: input.code,
    username,
    penName: input.penName.trim(),
    authKey: account.authKey,
    keyFields: account.keyFields,
  })
  const session = await signInAfterWrite(async (issued) => {
    const result = await loginNewAccount(username, account.authKey)
    issued(result.token.token)
    const bundle = result.keys ?? (await getKeys(result.token.token))
    return { result, bundle, keypair: account.keypair, groupKeypair: null }
  })
  return { ...session, recoveryCode: account.recoveryCode }
}
