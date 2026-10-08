import { claimAccount, getKeys, loginNewAccount, type ClaimInfo } from '../api/auth'
import { lockKeys, unlockWithClaimToken } from '../crypto'
import { samePenName } from '../utils/penName'
import { signInAfterWrite, type Joined } from './join'

// Claiming a managed account (README "Managed writers and claiming", end-to-end
// mode). The group made the writer's keypair in its own browser and locked a
// copy of the private key under the claim code; the server never saw the code.
// Here the writer's browser opens that copy with the typed code, re-locks the
// same private key under their new password and a new recovery code, and sends
// only those. The keypair does not change, so every letter already sealed to it
// stays readable. Claiming clears the group's copy of the key.

/** Whether this claim code came with the writer's locked key (end-to-end mode, a code made by the group). */
export function claimIsUsable(info: ClaimInfo): boolean {
  return Boolean(info.publicKey && info.claimWrappedPrivateKey && info.claimSalt && info.claimKdfParams)
}

/**
 * Open the writer's key with the claim code, take the account, and sign in.
 * Throws only while the account is not yet taken: the crypto error if the code
 * does not open the key (a mistyped code), and the API's errors otherwise (400
 * with `errors`, 404/410 for the code).
 */
export async function claim(
  info: ClaimInfo,
  input: { token: string; username: string; penName: string; password: string },
): Promise<Joined> {
  if (!claimIsUsable(info)) throw new Error('This claim code cannot be used to take over the account.')
  const keypair = await unlockWithClaimToken(
    {
      claimWrappedPrivateKey: info.claimWrappedPrivateKey!,
      claimSalt: info.claimSalt!,
      claimKdfParams: info.claimKdfParams!,
      publicKey: info.publicKey!,
    },
    input.token,
  )
  const locked = await lockKeys(keypair.privateKey, input.password)
  const username = input.username.trim()
  await claimAccount({
    token: input.token,
    username,
    // Left out to keep the one the group gave (the API requires one when there's none).
    penName: input.penName.trim() && !(info.writer.penName && samePenName(input.penName, info.writer.penName)) ? input.penName.trim() : undefined,
    authKey: locked.authKey,
    keyFields: locked.keyFields,
  })
  // The account is the writer's now and the claim code is spent: from here a
  // failed sign-in is returned with the recovery code, not thrown (see join.ts).
  const session = await signInAfterWrite(async (issued) => {
    const result = await loginNewAccount(username, locked.authKey)
    issued(result.token.token)
    const bundle = result.keys ?? (await getKeys(result.token.token))
    return { result, bundle, keypair, groupKeypair: null }
  })
  return { ...session, recoveryCode: locked.recoveryCode }
}
