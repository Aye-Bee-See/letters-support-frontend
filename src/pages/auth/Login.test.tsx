import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'
import { firstKeysForSplitAccount, KDF_PARAMS, signInKeys } from '../../crypto'
import { fakeApi, reply, type FakeRequest } from '../../test/fakeApi'
import { renderApp, type RenderOptions } from '../../test/render'
import { testUser } from '../../test/session'
import type { KeyBundle, LoginParams, UserRole } from '../../types'
import { useSignInAgain } from '../account/useSignInAgain'
import Login from './Login'

// The sign-in page with the real src/auth/signIn.ts and the API faked at the
// client: Argon2id runs, the derived auth key is what the fake API checks, and
// the account's real private key opens with the derived wrap key.

const PASSWORD = 'correct horse battery staple'
const params: LoginParams = { scheme: 'split', kdfSalt: 'AAECAwQFBgcICQoLDA0ODw==', kdfParams: { ...KDF_PARAMS } }
let authKey = ''
let bundle: KeyBundle

beforeAll(async () => {
  const keys = await signInKeys(PASSWORD, params)
  authKey = keys.authKey
  const made = await firstKeysForSplitAccount(keys.wrapKey, params)
  bundle = { ...made.keyFields, hasRecovery: true, orgKey: null }
}, 30000)

/** The API for one account: the right auth key signs in (or asks for a code). */
function account({ role = 'user' as UserRole, twoFactor = false, setupRequired = false } = {}) {
  const user = testUser({ username: 'sam', role })
  const signedIn = {
    user,
    token: { token: 'new-token', expires: Date.now() + 60_000 },
    keys: bundle,
    ...(setupRequired ? { twoFactor: { setupRequired: true, because: ['group'] } } : {}),
  }
  fakeApi.on('GET', '/auth/login-params', params, { params: { username: 'sam' } })
  fakeApi.on('POST', '/auth/login', (request: FakeRequest) => {
    const body = request.body as { username: string; password: string }
    if (body.username !== 'sam' || body.password !== authKey) return reply.error(401, { name: 'AuthenticationError' })
    return twoFactor ? { twoFactor: { challenge: 'challenge-1', expiresAt: new Date(Date.now() + 300_000).toISOString() } } : signedIn
  })
  fakeApi.on('POST', '/auth/login/two-factor', (request: FakeRequest) => {
    const body = request.body as { challenge: string; code?: string }
    if (body.challenge !== 'challenge-1') return reply.error(401, { name: 'TwoFactorError', condition: 'challenge_expired' })
    return body.code === '123456' ? signedIn : reply.error(400, { name: 'TwoFactorError', errors: ['Invalid code'] })
  })
}

const page = (name: string) => <p>page: {name}</p>

function visit(at: RenderOptions['at'] = '/login') {
  return renderApp(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/inbox" element={page('inbox')} />
      <Route path="/admin" element={page('admin')} />
      <Route path="/admin/queue" element={page('queue')} />
      <Route path="/account/security" element={page('security')} />
    </Routes>,
    { at },
  )
}

async function signInWith(password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Username'), 'sam')
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

/** Argon2id takes a moment: wait for its outcome longer than Testing Library's default second. */
const until = <T,>(check: () => T) => waitFor(check, { timeout: 20000 })

describe('Login', () => {
  it('signs in without sending the password, and lands where the person was going', async () => {
    account({ role: 'admin' })
    const view = visit({ pathname: '/login', state: { from: { pathname: '/admin/queue', search: '?status=pending', hash: '' } } })
    await signInWith(PASSWORD)
    await until(() => expect(view.location().pathname).toBe('/admin/queue'))
    expect(view.location().search).toBe('?status=pending')
    expect(screen.getByText('page: queue')).toBeTruthy()
    expect(view.auth()).toMatchObject({ isAdmin: true, token: 'new-token' })
    expect(view.auth().keypair?.publicKey).toBe(bundle.publicKey)
    // The password itself never left: only the derived auth key did.
    expect(JSON.stringify(fakeApi.calls)).not.toContain(PASSWORD)
    expect(fakeApi.callsTo('POST', '/auth/login')[0].body).toEqual({ username: 'sam', password: authKey })
  })

  it('with nowhere to go back to, lands on the person’s home', async () => {
    account()
    const view = visit()
    await signInWith(PASSWORD)
    await until(() => expect(view.location().pathname).toBe('/inbox'))
  })

  it('a wrong password says so and starts no session', async () => {
    account()
    const view = visit()
    await signInWith('wrong password')
    await until(() => expect(screen.getByRole('alert').textContent).toBe('Incorrect username or password.'))
    expect(view.auth().isAuthenticated).toBe(false)
    expect(view.location().pathname).toBe('/login')
  })

  it('two-factor: asks for the code; a wrong one keeps the challenge; the right one signs in', async () => {
    account({ twoFactor: true })
    const view = visit()
    const user = await signInWith(PASSWORD)
    const code = await until(() => screen.getByLabelText('Code'))
    expect(screen.getByText(/Your account uses two-factor sign-in/)).toBeTruthy()
    expect(view.auth().isAuthenticated).toBe(false)

    await user.type(code, '000000')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await until(() => expect(screen.getByRole('alert').textContent).toBe('That code didn’t work. Check it and try again.'))
    // Still the code step, for the same challenge.
    expect(screen.getByLabelText('Code')).toBeTruthy()

    await user.clear(screen.getByLabelText('Code'))
    await user.type(screen.getByLabelText('Code'), '123 456')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await until(() => expect(view.location().pathname).toBe('/inbox'))
    expect(view.auth().isWriter).toBe(true)

    const codes = fakeApi.callsTo('POST', '/auth/login/two-factor').map((c) => c.body)
    expect(codes).toEqual([
      { challenge: 'challenge-1', code: '000000' },
      { challenge: 'challenge-1', code: '123456' },
    ])
    // One key derivation per sign-in: the parameters were asked for once, the password sent once.
    expect(fakeApi.callsTo('GET', '/auth/login-params')).toHaveLength(1)
    expect(fakeApi.callsTo('POST', '/auth/login')).toHaveLength(1)
  })

  it('an account that must set up two-factor goes to the security page, wherever it was going', async () => {
    account({ setupRequired: true })
    const view = visit({ pathname: '/login', state: { from: { pathname: '/admin/queue', search: '', hash: '' } } })
    await signInWith(PASSWORD)
    await until(() => expect(view.location().pathname).toBe('/account/security'))
    expect(view.auth().twoFactorSetupRequired).toEqual(['group'])
  })

  it('a server asking for weaker key derivation is refused, and no sign-in request is made', async () => {
    account()
    fakeApi.on('GET', '/auth/login-params', { ...params, kdfParams: { ...KDF_PARAMS, opslimit: 1, memlimit: 8192 } })
    visit()
    await signInWith(PASSWORD)
    await until(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'This server asked for weaker sign-in protection than this site uses, so nothing was sent. Please tell a network admin.',
      ),
    )
    expect(fakeApi.callsTo('POST', '/auth/login')).toEqual([])
  })

  it('shows the line a page sent the person here with', () => {
    visit({ pathname: '/login', state: { notice: 'Your password is changed. Sign in with your new password.' } })
    expect(screen.getByRole('status').textContent).toBe('Your password is changed. Sign in with your new password.')
  })

  it('a page that signs the person out to sign in again (the recovery-code page) leaves its line here', async () => {
    fakeApi.on('POST', '/auth/logout', { signedOut: true, everywhere: false })
    function Changed() {
      const signInAgain = useSignInAgain()
      return (
        <button type="button" onClick={() => signInAgain('Your keys were changed on another device. Sign in again.')}>
          changed elsewhere
        </button>
      )
    }
    const view = renderApp(
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/account/recovery-code" element={<Changed />} />
      </Routes>,
      { at: '/account/recovery-code', session: { role: 'user' } },
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'changed elsewhere' }))
    await until(() => expect(view.location().pathname).toBe('/login'))
    expect(screen.getByRole('status').textContent).toBe('Your keys were changed on another device. Sign in again.')
    expect(view.auth().isAuthenticated).toBe(false)
    expect(fakeApi.callsTo('POST', '/auth/logout')).toHaveLength(1)
  })
}, 30000)
