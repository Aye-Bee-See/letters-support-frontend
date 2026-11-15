import { unlockGroupKey, type Keypair } from '../crypto'
import type { KeyBundle } from '../types'
import { openWithPassword } from './account'

// Unlocking a session that was restored after a reload (issue #76; restore.ts):
// the same unwrap as sign-in, from the key bundle the session already holds.
// The password is used here, on the device, to derive the key that opens the
// private key, and is sent nowhere: the session's token already says who this
// is, so the API isn't asked anything.

export interface Unlocked {
  keypair: Keypair
  /** The group's keypair, for a group admin who has been handed the group key. */
  groupKeypair: Keypair | null
}

/**
 * Open the account's private key with the password, and with it the group key
 * if this account holds one. Throws CurrentPasswordError (auth/account.ts) when
 * the password doesn't open it, and KdfParamsError for a bundle naming key
 * derivation costs out of bounds, as sign-in does.
 */
export async function unlockSession(keys: KeyBundle | null, password: string): Promise<Unlocked> {
  const keypair = await openWithPassword(keys, password)
  let groupKeypair: Keypair | null = null
  const org = keys?.orgKey
  if (org?.wrappedOrgPrivateKey && org.chapterPublicKey) {
    groupKeypair = await unlockGroupKey({ wrappedOrgPrivateKey: org.wrappedOrgPrivateKey, chapterPublicKey: org.chapterPublicKey }, keypair).catch(
      () => null, // a stale hand-out must not block unlocking, as at sign-in; the group's key page hands it out again
    )
  }
  return { keypair, groupKeypair }
}
