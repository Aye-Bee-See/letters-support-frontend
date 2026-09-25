// DEVELOPMENT ONLY: move the local API's seeded test accounts from `plain` to
// `split` sign-in, keeping their passwords, so the web client (which never sends
// a password) can sign in as them. Run with `npm run dev:split-accounts`.
//
// Each account signs in the old way ONCE, from this script, against a local API.
// It then gets keys made from its password (PUT /auth/keys) and moves to split
// with the same wrapped key (PUT /auth/user): the API accepts a split password
// only with the private key re-wrapped under it. This is the one place in the
// repository that sends a real password, and it refuses to run against
// anything but localhost.

import { getLoginParams, setKeys, setSplitPassword } from '../src/api/auth'
import client, { post, setAuthToken } from '../src/api/client'
import { createAccountKeys } from '../src/crypto'
import type { LoginResult } from '../src/types'

const ACCOUNTS: [username: string, password: string][] = [
  ['admin', 'abcpassword'],
  ['user1', 'password1'],
  ['user2', 'password2'],
  ['testgroup', 'testgroup-pass'],
]

const base = String(client.defaults.baseURL)
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)) {
  console.error(`Refusing to run: the API is ${base}, not a local development server.`)
  process.exit(1)
}

for (const [username, password] of ACCOUNTS) {
  try {
    const params = await getLoginParams(username)
    if (params.scheme === 'split') {
      console.log(`${username}: already split`)
      continue
    }
    const plain = await post<LoginResult>('/auth/login', { username, password })
    setAuthToken(plain.token.token)
    const account = await createAccountKeys(password)
    await setKeys(account.keyFields)
    const { wrappedPrivateKey, kdfSalt, kdfParams } = account.keyFields
    await setSplitPassword(plain.user.id, { authKey: account.authKey, wrappedPrivateKey, kdfSalt, kdfParams })
    setAuthToken(null)
    console.log(`${username}: moved to split (password unchanged), recovery code ${account.recoveryCode}`)
  } catch (err) {
    setAuthToken(null)
    const e = err as { status?: number; message?: string; errors?: string[] }
    console.error(`${username}: failed (${e.status ?? '?'}) ${e.errors?.join(' ') || e.message}`)
  }
}
