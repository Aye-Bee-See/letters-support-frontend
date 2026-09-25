import type { KdfParams, KeyBundle, LoginParams } from '../types'
import { formatCode, generateCode, hashCode } from './codes'
import { deriveCodeKey, deriveSplitKeys, KDF_PARAMS, newSalt, type SplitKeys } from './kdf'
import { generateKeypair, openSealed, publicKeyOf, sealTo, unwrapPrivateKey, wrapPrivateKey, type Keypair } from './primitives'
import { fromBase64, toBase64, wipe } from './sodium'

// The account flows the pages call. Each returns exactly the fields the API
// takes; pages add username, pen name, codes and so on. Nothing here talks to
// the API or keeps state: unlocked keys belong in AuthContext (memory only).

/** What the API stores to let a password open the private key. */
export interface PasswordKeyFields {
  wrappedPrivateKey: string
  kdfSalt: string
  kdfParams: KdfParams
}

/** What the API stores to let a recovery code open the private key. */
export interface RecoveryKeyFields {
  recoveryWrappedPrivateKey: string
  recoverySalt: string
  recoveryKdfParams: KdfParams
}

/** Wrap the private key under a password: the auth key to send, and the fields to store. */
export async function passwordKeys(privateKey: string, password: string): Promise<{ authKey: string; fields: PasswordKeyFields }> {
  const kdfSalt = await newSalt()
  const { wrapKey, authKey } = await deriveSplitKeys(password, kdfSalt, KDF_PARAMS)
  try {
    const wrappedPrivateKey = await wrapPrivateKey(privateKey, wrapKey)
    return { authKey, fields: { wrappedPrivateKey, kdfSalt, kdfParams: { ...KDF_PARAMS } } }
  } finally {
    await wipe(wrapKey)
  }
}

/**
 * A new recovery code for a private key. Show `recoveryCode` once, and make the
 * person confirm they saved it before continuing (web-dev note, 17 Sept, §3).
 */
export async function recoveryKeys(privateKey: string): Promise<{ recoveryCode: string; fields: RecoveryKeyFields }> {
  const code = await generateCode()
  const recoverySalt = await newSalt()
  const key = await deriveCodeKey(code, recoverySalt, KDF_PARAMS)
  try {
    const recoveryWrappedPrivateKey = await wrapPrivateKey(privateKey, key)
    return {
      recoveryCode: formatCode(code),
      fields: { recoveryWrappedPrivateKey, recoverySalt, recoveryKdfParams: { ...KDF_PARAMS } },
    }
  } finally {
    await wipe(key)
  }
}

export interface NewAccount {
  keypair: Keypair
  /** Sent as `password`, with `authScheme: "split"`. */
  authKey: string
  /** Shown once; the person must confirm they saved it. */
  recoveryCode: string
  /** publicKey plus both wrapped copies of the private key, for the API. */
  keyFields: { publicKey: string } & PasswordKeyFields & RecoveryKeyFields
}

/**
 * Everything a new account needs, made on the device: a keypair, the private
 * key wrapped under the password (split scheme) and under a new recovery code.
 * Used for joining with an invite code, claiming, and first key set-up.
 */
export async function createAccountKeys(password: string): Promise<NewAccount> {
  const keypair = await generateKeypair()
  const pw = await passwordKeys(keypair.privateKey, password)
  const rc = await recoveryKeys(keypair.privateKey)
  return {
    keypair,
    authKey: pw.authKey,
    recoveryCode: rc.recoveryCode,
    keyFields: { publicKey: keypair.publicKey, ...pw.fields, ...rc.fields },
  }
}

/**
 * Sign-in, step 2: derive the keys from the password and GET /auth/login-params.
 * Send `authKey`; keep `wrapKey` only until the private key is unlocked, then wipe it.
 * Split accounts only: the plain path (seeded and test accounts) sends the
 * typed password and must never be reached by falling back from this.
 */
export async function signInKeys(password: string, params: LoginParams): Promise<SplitKeys> {
  if (params.scheme !== 'split') throw new Error('signInKeys is for split accounts only.')
  return deriveSplitKeys(password, params.kdfSalt, params.kdfParams)
}

/** Check that an unwrapped private key belongs to the expected public key. */
async function asKeypair(privateKey: string, publicKey: string | null): Promise<Keypair> {
  const derived = await publicKeyOf(privateKey)
  if (publicKey && derived !== publicKey) throw new Error('The unlocked key does not match this account.')
  return { publicKey: derived, privateKey }
}

/** Sign-in, step 3: open the private key from the key bundle with the wrap key. Wipes the wrap key. */
export async function unlockAccount(bundle: Pick<KeyBundle, 'wrappedPrivateKey' | 'publicKey'>, wrapKey: Uint8Array): Promise<Keypair> {
  try {
    if (!bundle.wrappedPrivateKey) throw new Error('This account has no keys yet.')
    return await asKeypair(await unwrapPrivateKey(bundle.wrappedPrivateKey, wrapKey), bundle.publicKey)
  } finally {
    await wipe(wrapKey)
  }
}

/** Recovery: open the private key with the recovery code (GET /auth/recover gives the fields). */
export async function unlockWithRecoveryCode(
  recovery: RecoveryKeyFields & { publicKey: string | null },
  code: string,
): Promise<Keypair> {
  const key = await deriveCodeKey(code, recovery.recoverySalt, recovery.recoveryKdfParams)
  try {
    return await asKeypair(await unwrapPrivateKey(recovery.recoveryWrappedPrivateKey, key), recovery.publicKey)
  } finally {
    await wipe(key)
  }
}

/** Recovery's sealed challenge: open it with the unlocked keypair and send it back (base64). */
export async function openChallenge(sealedChallenge: string, keypair: Keypair): Promise<string> {
  const bytes = await openSealed(sealedChallenge, keypair)
  const answer = await toBase64(bytes)
  await wipe(bytes)
  return answer
}

// --- Claim tokens (end-to-end mode: the group's browser makes them) ---------

export interface ClaimMaterial {
  /** Shown to the group admin once, to hand to the writer. The server never sees it. */
  token: string
  /** POST /auth/writer/token fields. */
  fields: { tokenHash: string; claimWrappedPrivateKey: string; claimSalt: string; claimKdfParams: KdfParams }
}

/** A claim token for a managed writer's private key (which the group holds). */
export async function createClaimToken(writerPrivateKey: string): Promise<ClaimMaterial> {
  const token = await generateCode()
  const claimSalt = await newSalt()
  const key = await deriveCodeKey(token, claimSalt, KDF_PARAMS)
  try {
    return {
      token: formatCode(token),
      fields: {
        tokenHash: await hashCode(token),
        claimWrappedPrivateKey: await wrapPrivateKey(writerPrivateKey, key),
        claimSalt,
        claimKdfParams: { ...KDF_PARAMS },
      },
    }
  } finally {
    await wipe(key)
  }
}

/** Claiming: open the writer's private key with the typed claim token (GET /auth/claim gives the fields). */
export async function unlockWithClaimToken(
  claim: { claimWrappedPrivateKey: string; claimSalt: string; claimKdfParams: KdfParams; publicKey: string | null },
  token: string,
): Promise<Keypair> {
  const key = await deriveCodeKey(token, claim.claimSalt, claim.claimKdfParams)
  try {
    return await asKeypair(await unwrapPrivateKey(claim.claimWrappedPrivateKey, key), claim.publicKey)
  } finally {
    await wipe(key)
  }
}

// --- Group keys --------------------------------------------------------------

/** Open the group's private key from the member's bundle (orgKey.wrappedOrgPrivateKey is sealed to the member). */
export async function unlockGroupKey(
  orgKey: { wrappedOrgPrivateKey: string; chapterPublicKey: string },
  member: Keypair,
): Promise<Keypair> {
  const raw = await openSealed(orgKey.wrappedOrgPrivateKey, member)
  const privateKey = await toBase64(raw)
  await wipe(raw)
  return asKeypair(privateKey, orgKey.chapterPublicKey)
}

/** Seal a private key (a group's, or a managed writer's) to someone's public key. */
export async function sealPrivateKeyTo(privateKey: string, recipientPublicKey: string): Promise<string> {
  const raw = await fromBase64(privateKey)
  try {
    return await sealTo(recipientPublicKey, raw)
  } finally {
    await wipe(raw)
  }
}
