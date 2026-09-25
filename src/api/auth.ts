import client, { getOne, post, put } from './client'
import type { PasswordKeyFields, RecoveryKeyFields } from '../crypto'
import type { ApiEnvelope, KeyBundle, LoginParams, LoginResult } from '../types'

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

export const checkPenName = (name: string) =>
  getOne<{ available: boolean; reason?: string }>('/auth/pen-name-available', { name })
