import { beforeEach, describe, expect, it, vi } from 'vitest'
import { firstKeysForSplitAccount, KDF_PARAMS } from '../crypto'
import type { LoginParams } from '../types'

// Sign-in with the API faked: a server naming key derivation costs out of
// bounds is refused before anything derived from the password is sent.

const api = vi.hoisted(() => ({ getLoginParams: vi.fn(), login: vi.fn(), getKeys: vi.fn(), logout: vi.fn() }))
vi.mock('../api/auth', () => ({
  ...api,
  isTwoFactorChallenge: (answer: { twoFactor?: object }) => answer.twoFactor !== undefined && 'challenge' in answer.twoFactor,
}))
const twoFactor = vi.hoisted(() => ({ loginTwoFactor: vi.fn() }))
vi.mock('../api/twoFactor', () => twoFactor)
// The real key derivation, counted: the second step must not run it.
const derive = vi.hoisted(() => ({ runs: 0 }))
vi.mock('../crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../crypto')>()
  return {
    ...actual,
    signInKeys: (password: string, loginParams: LoginParams) => {
      derive.runs++
      return actual.signInKeys(password, loginParams)
    },
  }
})

const { signIn, SignInError } = await import('./signIn')

const params = (kdfParams: object) => ({ scheme: 'split', kdfSalt: 'AAECAwQFBgcICQoLDA0ODw==', kdfParams })

describe('signIn and the server’s key derivation costs', () => {
  beforeEach(() => vi.resetAllMocks())

  it('refuses costs below the agreed ones, sending nothing', async () => {
    api.getLoginParams.mockResolvedValue(params({ ...KDF_PARAMS, opslimit: 1, memlimit: 8192 }))
    const refused = signIn('chapter1', 'password')
    await expect(refused).rejects.toBeInstanceOf(SignInError)
    await expect(refused).rejects.toMatchObject({ kind: 'weak_params' })
    expect(api.login).not.toHaveBeenCalled()
  })

  it('refuses costs above the cap, sending nothing', async () => {
    api.getLoginParams.mockResolvedValue(params({ ...KDF_PARAMS, memlimit: 2 * 1024 ** 3 }))
    await expect(signIn('chapter1', 'password')).rejects.toMatchObject({ kind: 'heavy_params' })
    expect(api.login).not.toHaveBeenCalled()
  })

  it('goes ahead with the agreed costs', async () => {
    api.getLoginParams.mockResolvedValue(params(KDF_PARAMS))
    api.login.mockRejectedValue({ status: 401, name: 'AuthenticationError', condition: null, errors: [], message: 'Unauthorized' })
    await expect(signIn('chapter1', 'password')).rejects.toMatchObject({ kind: 'credentials' })
    expect(api.login).toHaveBeenCalledWith('chapter1', expect.any(String))
  })
}, 30000)

describe('a sign-in refused after the token was issued', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getLoginParams.mockResolvedValue(params(KDF_PARAMS))
    api.logout.mockResolvedValue(undefined)
  })

  it('an account without keys: the token is revoked', async () => {
    api.login.mockResolvedValue({ token: { token: 'issued', expires: 0 }, user: {}, keys: { publicKey: null, wrappedPrivateKey: null } })
    await expect(signIn('user1', 'password')).rejects.toMatchObject({ kind: 'no_keys' })
    expect(api.logout).toHaveBeenCalledWith('issued')
  })

  it('a key the password does not open: the token is revoked', async () => {
    api.login.mockResolvedValue({ token: { token: 'issued', expires: 0 }, user: {}, keys: { publicKey: 'p', wrappedPrivateKey: 'AAAA' } })
    await expect(signIn('user1', 'password')).rejects.toMatchObject({ kind: 'keys' })
    expect(api.logout).toHaveBeenCalledWith('issued')
  })

  it('a wrong password: no token, nothing to revoke', async () => {
    api.login.mockRejectedValue({ status: 401, name: 'AuthenticationError', condition: null, errors: [], message: 'Unauthorized' })
    await expect(signIn('user1', 'password')).rejects.toMatchObject({ kind: 'credentials' })
    expect(api.logout).not.toHaveBeenCalled()
  })
}, 30000)

describe('two-factor sign-in: one key derivation per sign-in', () => {
  const loginParams: LoginParams = { scheme: 'split', kdfSalt: 'AAECAwQFBgcICQoLDA0ODw==', kdfParams: { ...KDF_PARAMS } }

  beforeEach(() => {
    vi.resetAllMocks()
    derive.runs = 0
    api.getLoginParams.mockResolvedValue(loginParams)
    api.logout.mockResolvedValue(undefined)
  })

  it('the first step hands over the wrap key with the challenge', async () => {
    api.login.mockResolvedValue({ twoFactor: { challenge: 'c', expiresAt: '2026-10-08T12:05:00.000Z' } })
    const outcome = await signIn('user1', 'password')
    expect(outcome).toMatchObject({ codeNeeded: true, challenge: 'c' })
    expect('codeNeeded' in outcome && outcome.wrapKey).toHaveLength(32)
    expect(derive.runs).toBe(1)
  })

  it('the second step derives nothing when given the keys, and leaves the caller’s key for another code', async () => {
    const wrapKey = new Uint8Array(32).fill(7)
    const made = await firstKeysForSplitAccount(wrapKey.slice(), loginParams)
    const bundle = { ...made.keyFields, hasRecovery: true }

    twoFactor.loginTwoFactor.mockRejectedValueOnce({ status: 400, name: 'TwoFactorError', condition: null, errors: [], message: 'Bad code' })
    await expect(signIn('user1', { wrapKey }, { challenge: 'c', factor: { code: '000000' } })).rejects.toMatchObject({ kind: 'wrong_code' })
    expect(wrapKey.every((b) => b === 7)).toBe(true)

    twoFactor.loginTwoFactor.mockResolvedValueOnce({ token: { token: 't', expires: 0 }, user: {}, keys: bundle })
    const signedIn = await signIn('user1', { wrapKey }, { challenge: 'c', factor: { code: '123456' } })
    expect(signedIn.keypair.publicKey).toBe(made.keypair.publicKey)
    expect(twoFactor.loginTwoFactor).toHaveBeenLastCalledWith('c', { code: '123456' })
    expect(derive.runs).toBe(0)
    expect(api.getLoginParams).not.toHaveBeenCalled()
    expect(api.login).not.toHaveBeenCalled()
    // signIn wiped only the copy it used; the caller wipes its own.
    expect(wrapKey.every((b) => b === 7)).toBe(true)
  })
}, 30000)
