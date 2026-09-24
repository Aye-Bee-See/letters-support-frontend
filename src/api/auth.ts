import { getOne, post } from './client'
import type { KeyBundle, LoginParams, LoginResult } from '../types'

// Sign-in is split (README "Signing in without sending the password"):
//   1. getLoginParams(username) -> { scheme, kdfSalt, kdfParams }
//   2. split: derive authKey on the device (src/crypto, Step 3); password = base64(authKey)
//   3. login(username, password)
// Only the seeded admin and test accounts are 'plain'. Never fall back from
// split to sending the real password automatically.

export const getLoginParams = (username: string) =>
  getOne<LoginParams>('/auth/login-params', { username })

/** `password` is base64(authKey) for split accounts, the typed password only on the explicit plain path. */
export const login = (username: string, password: string) =>
  post<LoginResult>('/auth/login', { username, password })

export const getKeys = () => getOne<KeyBundle>('/auth/keys')

export const checkPenName = (name: string) =>
  getOne<{ available: boolean; reason?: string }>('/auth/pen-name-available', { name })

// --- Device memory of split accounts ---------------------------------------
// Once a device has signed a username in as split, it refuses to sign that
// username in as plain, whatever the server says (defence against a tampered
// server). This flag is not a secret, so it is the one auth fact kept in
// browser storage. Tokens and keys never are.

const SPLIT_KEY = 'letters.support:split-usernames'

function readSplitNames(): string[] {
  try {
    const raw = localStorage.getItem(SPLIT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function isKnownSplit(username: string): boolean {
  return readSplitNames().includes(username.trim().toLowerCase())
}

export function rememberSplit(username: string): void {
  const name = username.trim().toLowerCase()
  const names = readSplitNames()
  if (names.includes(name)) return
  try {
    localStorage.setItem(SPLIT_KEY, JSON.stringify([...names, name]))
  } catch {
    // Storage unavailable (private mode): the check simply can't persist.
  }
}
