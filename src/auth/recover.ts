import { finishRecovery, getKeys, isTwoFactorChallenge, login, startRecovery } from '../api/auth'
import { toApiError } from '../api/client'
import { KdfParamsError, lockKeys, openChallenge, unlockGroupKey, unlockWithRecoveryCode, type Keypair } from '../crypto'
import { signInAfterWrite, type Joined } from './join'

// Recovery with a recovery code (README "End-to-end mode: Recovery").
// The recovery code never leaves the device. It opens the copy of the private
// key that was locked under it; the private key then opens a one-time
// challenge the API sealed to the account, which proves to the API that the
// person holds the code. The same private key is locked under the new password
// and a new recovery code (the old one has now been typed out). The keypair
// does not change, so every letter stays readable.

export interface OpenedRecovery {
  username: string
  keypair: Keypair
  /** The opened challenge (base64), single use, valid for a few minutes. */
  challenge: string
}

/** Step 1: open the account's key with the recovery code. Throws RecoveryCodeError for a code that does not fit. */
export class RecoveryCodeError extends Error {}

export async function openRecovery(username: string, recoveryCode: string): Promise<OpenedRecovery> {
  const name = username.trim()
  const start = await startRecovery(name)
  let keypair: Keypair
  try {
    keypair = await unlockWithRecoveryCode(start, recoveryCode)
  } catch (err) {
    // Costs out of bounds are the server's doing, not a mistyped code.
    if (err instanceof KdfParamsError) throw err
    throw new RecoveryCodeError('That recovery code does not match this account.')
  }
  return { username: name, keypair, challenge: await openChallenge(start.sealedChallenge, keypair) }
}

/**
 * Step 2: set the new password, then sign in. If the challenge expired while
 * the person chose a password (401), a fresh one is fetched and opened with the
 * key already in memory, and the request is sent once more. Throws only while
 * the password is not yet changed.
 */
export async function completeRecovery(opened: OpenedRecovery, newPassword: string): Promise<Joined> {
  const locked = await lockKeys(opened.keypair.privateKey, newPassword)
  const send = (challenge: string) =>
    finishRecovery({ username: opened.username, challenge, authKey: locked.authKey, keyFields: locked.keyFields })
  try {
    await send(opened.challenge)
  } catch (err) {
    if (toApiError(err).status !== 401) throw err
    const fresh = await startRecovery(opened.username)
    await send(await openChallenge(fresh.sealedChallenge, opened.keypair))
  }
  // The new password and recovery code are saved and the old code is used up:
  // from here a failed sign-in is returned with the new code, not thrown (see join.ts).
  const session = await signInAfterWrite(async (issued) => {
    const answer = await login(opened.username, locked.authKey)
    // Recovery leaves two-factor sign-in as it was. With it on, signing in needs a
    // code too; the new recovery code must still be shown (the old one is used up).
    if (isTwoFactorChallenge(answer)) return null
    const result = answer
    issued(result.token.token)
    const bundle = result.keys ?? (await getKeys(result.token.token))
    // A group admin's group key opens with their (unchanged) keypair, as at sign-in.
    const org = bundle.orgKey
    const groupKeypair =
      org?.wrappedOrgPrivateKey && org.chapterPublicKey
        ? await unlockGroupKey({ wrappedOrgPrivateKey: org.wrappedOrgPrivateKey, chapterPublicKey: org.chapterPublicKey }, opened.keypair).catch(() => null)
        : null
    return { result, bundle, keypair: opened.keypair, groupKeypair }
  })
  return { ...session, recoveryCode: locked.recoveryCode }
}
