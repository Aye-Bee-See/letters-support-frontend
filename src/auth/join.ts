import { getKeys, joinWithCode, loginNewAccount } from '../api/auth'
import { createAccountKeys } from '../crypto'
import type { SignedIn } from './signIn'

// Joining with an invite code (README "Invite codes"; 22 Sept note §3). The
// account and its keys are made together: the keypair is generated on the
// device, the private key is locked under the password (split scheme) and
// under a new recovery code, and only locked copies go to the API. Then the
// new account signs in with the auth key already derived, so the password is
// not run through Argon2id twice.

export interface Joined {
  /**
   * null after a recovery for an account with two-factor sign-in on: the password
   * is changed, but signing in also needs a code, so the person signs in again.
   */
  signedIn: SignedIn | null
  /** Show once; the person must confirm they saved it before continuing. */
  recoveryCode: string
}

/** Make the account and sign in. Errors are the API's (see toApiError): 400 with `errors`, 404/410 for the code. */
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
  const result = await loginNewAccount(username, account.authKey)
  const bundle = result.keys ?? (await getKeys(result.token.token))
  return {
    signedIn: { result, bundle, keypair: account.keypair, groupKeypair: null },
    recoveryCode: account.recoveryCode,
  }
}
