import client, { getOne, post, put } from './client'
import type { PasswordKeyFields, RecoveryKeyFields } from '../crypto'
import type { ApiEnvelope, KdfParams, KeyBundle, LoginParams, LoginResult, User } from '../types'

// Sign-in is split (README "Signing in without sending the password"):
//   1. getLoginParams(username) -> { scheme, kdfSalt, kdfParams }
//   2. derive authKey on the device (src/crypto); password = base64(authKey)
//   3. login(username, authKey)
// The web client never sends a password; src/auth/signIn.ts refuses `plain`.

export const getLoginParams = (username: string) =>
  getOne<LoginParams>('/auth/login-params', { username })

/** `authKey` is base64 of the derived auth key (44 characters), never the password. */
export const login = (username: string, authKey: string) =>
  post<LoginResult>('/auth/login', { username, password: authKey })

/**
 * The caller's key bundle. Pass the token explicitly during sign-in, before
 * the session (and so the client's default token) exists.
 */
export const getKeys = async (token?: string): Promise<KeyBundle> => {
  if (!token) return getOne<KeyBundle>('/auth/keys')
  const response = await client.get<ApiEnvelope<KeyBundle>>('/auth/keys', { headers: { Authorization: `Bearer ${token}` } })
  return response.data.data
}

/**
 * Set the caller's keys (PUT /auth/keys): the public key and the private key
 * wrapped under the password and under a recovery code. The public key is set
 * once and never changes.
 */
export const setKeys = (fields: PasswordKeyFields & RecoveryKeyFields & { publicKey: string }) =>
  put<{ caughtUp?: { letters: number; sealed: number; dropped: number } | null }>('/auth/keys', fields)

/**
 * A split password on the caller's own account (PUT /auth/user): a password
 * change, and how an account moves from plain to split. The API requires the
 * private key re-wrapped under the new password in the same request, so an
 * account needs keys (setKeys) before it can become split.
 */
export const setSplitPassword = (id: number, creds: { authKey: string } & PasswordKeyFields) =>
  put('/auth/user', {
    id,
    authScheme: 'split',
    password: creds.authKey,
    wrappedPrivateKey: creds.wrappedPrivateKey,
    kdfSalt: creds.kdfSalt,
    kdfParams: creds.kdfParams,
  })

/** GET /auth/pen-name-available (public, rate limited). `name` is the cleaned form the API would store. */
export const checkPenName = (name: string) =>
  getOne<{ available: boolean; name: string; reason: string | null; twoParts: boolean }>('/auth/pen-name-available', { name })

// --- Recovery with a recovery code --------------------------------------------

/**
 * GET /auth/recover?username= (public, rate limited): the private key locked
 * under the recovery code, and a one-time challenge sealed to the account's
 * public key, valid `expiresIn` seconds. 404 when no account with that
 * username can be recovered with a code.
 */
export interface RecoveryStart {
  user: number
  publicKey: string
  recoveryWrappedPrivateKey: string
  recoverySalt: string
  recoveryKdfParams: KdfParams
  sealedChallenge: string
  expiresIn: number
}

export const startRecovery = (username: string) => getOne<RecoveryStart>('/auth/recover', { username })

/**
 * POST /auth/recover: the opened challenge proves the recovery code opened the
 * key; the same key is locked under the new password (and a new recovery code).
 * 401 if the challenge expired or was used. Ends every existing session.
 */
export const finishRecovery = (req: {
  username: string
  challenge: string
  authKey: string
  keyFields: PasswordKeyFields & RecoveryKeyFields
}) =>
  post<{ user: number; username: string }>('/auth/recover', {
    username: req.username,
    challenge: req.challenge,
    authScheme: 'split',
    password: req.authKey,
    ...req.keyFields,
  })

// --- Claiming a managed account ---------------------------------------------

/**
 * GET /auth/claim?token= (public): who the claim code is for, and in end-to-end
 * mode the writer's private key locked under the code. 404 for an unknown or
 * revoked code; 410 with a `condition` of used or expired.
 */
export interface ClaimInfo {
  writer: { id: number; name: string }
  chapter: { id: number; name: string } | null
  expiresAt: string
  publicKey?: string | null
  claimWrappedPrivateKey?: string | null
  claimSalt?: string | null
  claimKdfParams?: KdfParams | null
}

export const getClaimInfo = (token: string) => getOne<ClaimInfo>('/auth/claim', { token })

export interface ClaimRequest {
  token: string
  username: string
  /** Optional: a group may already have given the writer one. */
  penName?: string
  authKey: string
  keyFields: PasswordKeyFields & RecoveryKeyFields
}

/** POST /auth/claim: the account becomes the writer's; the group's copy of the key is cleared. */
export const claimAccount = (req: ClaimRequest) =>
  post<User>('/auth/claim', {
    token: req.token,
    username: req.username,
    ...(req.penName ? { penName: req.penName } : {}),
    authScheme: 'split',
    password: req.authKey,
    ...req.keyFields,
  })

// --- Invite codes (joining) ---------------------------------------------------

/**
 * GET /auth/join?code= (public, rate limited): who is vouching, while the code
 * is usable. 404 for a code never issued; 410 with a `condition` of used,
 * cancelled, expired or inactive otherwise.
 */
export const checkInviteCode = (code: string) =>
  getOne<{ chapter: { id: number; name: string }; expiresAt: string }>('/auth/join', { code })

export interface JoinRequest {
  code: string
  username: string
  penName: string
  /** base64 auth key; sent as `password` with authScheme "split". */
  authKey: string
  keyFields: { publicKey: string } & PasswordKeyFields & RecoveryKeyFields
}

/** POST /auth/join: makes the account, with its keys, and spends the code in one step. */
export const joinWithCode = (req: JoinRequest) =>
  post<{ user: User; chapter: { id: number; name: string } }>('/auth/join', {
    code: req.code,
    username: req.username,
    penName: req.penName,
    authScheme: 'split',
    password: req.authKey,
    ...req.keyFields,
  })
