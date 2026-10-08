import { getKeys, loginNewAccount } from '../api/auth'
import { acceptInvitation } from '../api/invitations'
import { createAccountKeys, unlockGroupKey } from '../crypto'
import { signInAfterWrite, type Joined } from './join'

// Accepting an invitation (README "Invitations"), as joining with an invite
// code does: the keypair is made on the device, the private key is locked under
// the password (split scheme) and a new recovery code, and only locked copies go
// to the API. Then the new account signs in with the auth key already derived.
// Only a failure before the account exists throws.

export interface AcceptInput {
  token: string
  username: string
  email: string
  name: string
  penName: string
  password: string
  /** For a group invitation: the new group's profile. */
  group?: Record<string, unknown>
}

export async function accept(input: AcceptInput): Promise<Joined & { activation: 'immediate' | 'admin_review'; group: string }> {
  const account = await createAccountKeys(input.password)
  const username = input.username.trim()
  const accepted = await acceptInvitation({
    token: input.token,
    username,
    email: input.email.trim(),
    name: input.name.trim() || undefined,
    penName: input.penName.trim(),
    authKey: account.authKey,
    keyFields: account.keyFields,
    group: input.group,
  })
  // The account exists and the invitation is spent: from here a failed sign-in
  // is returned with the recovery code, not thrown (see join.ts).
  const session = await signInAfterWrite(async () => {
    const result = await loginNewAccount(username, account.authKey)
    const bundle = result.keys ?? (await getKeys(result.token.token))
    // As at sign-in: open the group key if the bundle carries one. A new group has
    // none yet, and a new member's is handed over later, but nothing here assumes so.
    const org = bundle.orgKey
    const groupKeypair =
      org?.wrappedOrgPrivateKey && org.chapterPublicKey
        ? await unlockGroupKey({ wrappedOrgPrivateKey: org.wrappedOrgPrivateKey, chapterPublicKey: org.chapterPublicKey }, account.keypair).catch(() => null)
        : null
    return { result, bundle, keypair: account.keypair, groupKeypair }
  })
  return {
    ...session,
    recoveryCode: account.recoveryCode,
    activation: accepted.activation,
    group: accepted.chapter.name,
  }
}
