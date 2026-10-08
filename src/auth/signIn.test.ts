import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KDF_PARAMS } from '../crypto'

// Sign-in with the API faked: a server naming key derivation costs out of
// bounds is refused before anything derived from the password is sent.

const api = vi.hoisted(() => ({ getLoginParams: vi.fn(), login: vi.fn(), getKeys: vi.fn() }))
vi.mock('../api/auth', () => ({ ...api, isTwoFactorChallenge: () => false }))

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
