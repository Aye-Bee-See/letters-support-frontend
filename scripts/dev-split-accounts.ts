// DEVELOPMENT ONLY: make the local API's seeded test accounts usable from the
// web client, keeping their passwords. Run with `npm run dev:split-accounts`
// (it uses VITE_API_URL, like the app, and refuses anything but localhost).
//
// Two cases (web issue #3):
//
// - A `plain` account signs in the old way ONCE, from this script. It then gets
//   keys made from its password (PUT /auth/keys) and moves to split with the
//   same wrapped key (PUT /auth/user): the API accepts a split password only
//   with the private key re-wrapped under it. This is the one place in the
//   repository that sends a real password.
// - A `split` account with no keys (every account the API seeds now) signs in
//   the way the web client does, with the auth key, and gets its first keys
//   (PUT /auth/keys): the private key wrapped under the wrap key derived with
//   its EXISTING salt and parameters, which are sent back unchanged. A new salt
//   would lock the account out, and the API refuses one (API #181).
//
// The recovery codes are printed: these are seeded development accounts, and a
// recovery code is otherwise shown only once, to the person, in the browser.

import { getKeys, getLoginParams, isTwoFactorChallenge, login, logout, setKeys, setSplitPassword } from '../src/api/auth'
import client, { post, setAuthToken } from '../src/api/client'
import { createAccountKeys, firstKeysForSplitAccount, signInKeys, wipe } from '../src/crypto'
import type { LoginParams, LoginResult } from '../src/types'

// The seeded accounts (sqlite-express-api README "Credentials"). Add your own as needed.
const ACCOUNTS: [username: string, password: string][] = [
  ['admin', 'abcpassword'],
  ['chapter1', 'a long enough password'],
  ['user1', 'password1'],
  ['user2', 'password2'],
]

const base = String(client.defaults.baseURL)
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)) {
  console.error(`Refusing to run: the API is ${base}, not a local development server.`)
  process.exit(1)
}
console.log(`API: ${base}`)

/** plain -> split, with keys made from the password. */
async function moveToSplit(username: string, password: string): Promise<string> {
  const plain = await post<LoginResult>('/auth/login', { username, password })
  setAuthToken(plain.token.token)
  const account = await createAccountKeys(password)
  await setKeys(account.keyFields)
  const { wrappedPrivateKey, kdfSalt, kdfParams } = account.keyFields
  await setSplitPassword(plain.user.id, { authKey: account.authKey, wrappedPrivateKey, kdfSalt, kdfParams })
  return `moved to split (password unchanged), recovery code ${account.recoveryCode}`
}

/** split with no keys -> keys under the existing salt. */
async function giveKeys(username: string, password: string, params: LoginParams): Promise<string> {
  const { wrapKey, authKey } = await signInKeys(password, params)
  let token: string | null = null
  try {
    const answer = await login(username, authKey)
    // Two-factor sign-in can only have been switched on from a signed-in session, which needs keys first.
    if (isTwoFactorChallenge(answer)) return 'asks for a two-factor code; skipped'
    token = answer.token.token
    setAuthToken(token)
    const bundle = answer.keys ?? (await getKeys())
    if (bundle.publicKey) return 'already split, with keys'
    const first = await firstKeysForSplitAccount(wrapKey, params) // wipes wrapKey
    await setKeys(first.keyFields)
    return `given keys (password and salt unchanged), recovery code ${first.recoveryCode}`
  } finally {
    await wipe(wrapKey)
    if (token) await logout(token).catch(() => undefined)
  }
}

for (const [username, password] of ACCOUNTS) {
  try {
    const params = await getLoginParams(username)
    const done = params.scheme === 'split' ? await giveKeys(username, password, params) : await moveToSplit(username, password)
    console.log(`${username}: ${done}`)
  } catch (err) {
    const e = err as { status?: number; message?: string; errors?: string[] }
    // An unknown username gets a stable fake split salt from login-params, so it fails here, at sign-in (401).
    console.error(`${username}: failed (${e.status ?? '?'}) ${e.errors?.join(' ') || e.message}`)
  } finally {
    setAuthToken(null)
  }
}
