import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKeypair } from '../crypto'
import type { ApiError } from '../types'

// Making an account (or a new password) and signing in are two steps: once the
// write is done, a failed sign-in must not lose the recovery code. The API is
// faked; the key handling is real.

const rateLimited: ApiError = { status: 429, name: 'RateLimitError', condition: null, errors: [], message: 'Too many sign-in attempts.', retryAfter: 600 }
const taken: ApiError = { status: 400, name: 'ValidationError', condition: null, errors: ['That username is taken.'], message: 'That username is taken.' }

const api = vi.hoisted(() => ({
  joinWithCode: vi.fn(),
  claimAccount: vi.fn(),
  finishRecovery: vi.fn(),
  startRecovery: vi.fn(),
  login: vi.fn(),
  loginNewAccount: vi.fn(),
  getKeys: vi.fn(),
  acceptInvitation: vi.fn(),
}))
vi.mock('../api/auth', () => ({
  ...api,
  isTwoFactorChallenge: (answer: { twoFactor?: object }) => answer.twoFactor !== undefined && 'challenge' in answer.twoFactor,
}))
vi.mock('../api/invitations', () => ({ acceptInvitation: api.acceptInvitation }))

const { join } = await import('./join')
const { accept } = await import('./acceptInvitation')
const { completeRecovery } = await import('./recover')

const signedInAnswer = { token: { token: 't', expires: 0 }, user: {}, keys: { publicKey: 'p', wrappedPrivateKey: 'w' } }
const joinInput = { code: 'ABCD-EFGH-JKMN', username: ' sam ', penName: 'Sam Rivers', password: 'a long enough password' }

beforeEach(() => {
  vi.resetAllMocks()
  api.joinWithCode.mockResolvedValue(undefined)
  api.acceptInvitation.mockResolvedValue({ activation: 'immediate', chapter: { name: 'Test Chapter' } })
  api.finishRecovery.mockResolvedValue(undefined)
  api.loginNewAccount.mockResolvedValue(signedInAnswer)
  api.login.mockResolvedValue(signedInAnswer)
})

describe('join', () => {
  it('signs in after making the account', async () => {
    const joined = await join(joinInput)
    expect(api.loginNewAccount).toHaveBeenCalledWith('sam', expect.any(String))
    expect(joined.signedIn).not.toBeNull()
    expect(joined.signInError).toBeNull()
    expect(joined.recoveryCode).toMatch(/\S/)
  })

  it('account made, sign-in fails: the recovery code is still returned, with the reason', async () => {
    api.loginNewAccount.mockRejectedValue(rateLimited)
    const joined = await join(joinInput)
    expect(api.joinWithCode).toHaveBeenCalledOnce()
    expect(joined.signedIn).toBeNull()
    expect(joined.signInError).toMatchObject({ status: 429 })
    expect(joined.recoveryCode).toMatch(/\S/)
  })

  it('a dropped connection while fetching the keys counts as a failed sign-in, not a failed join', async () => {
    api.loginNewAccount.mockResolvedValue({ ...signedInAnswer, keys: undefined })
    api.getKeys.mockRejectedValue(new Error('Network Error'))
    const joined = await join(joinInput)
    expect(joined.signedIn).toBeNull()
    expect(joined.signInError).toMatchObject({ status: 0 })
    expect(joined.recoveryCode).toMatch(/\S/)
  })

  it('throws when the account is not made, and does not try to sign in', async () => {
    api.joinWithCode.mockRejectedValue(taken)
    await expect(join(joinInput)).rejects.toMatchObject({ status: 400 })
    expect(api.loginNewAccount).not.toHaveBeenCalled()
  })
}, 30000)

describe('accepting an invitation', () => {
  const input = { token: 'tok', username: 'sam', email: 'sam@example.org', name: '', penName: 'Sam Rivers', password: 'a long enough password' }

  it('account made, sign-in fails: the recovery code and the group are still returned', async () => {
    api.loginNewAccount.mockRejectedValue({ ...rateLimited, status: 503, name: null })
    const accepted = await accept(input)
    expect(accepted).toMatchObject({ signedIn: null, signInError: { status: 503 }, activation: 'immediate', group: 'Test Chapter' })
    expect(accepted.recoveryCode).toMatch(/\S/)
  })

  it('throws when the account is not made', async () => {
    api.acceptInvitation.mockRejectedValue({ ...taken, status: 410 })
    await expect(accept(input)).rejects.toMatchObject({ status: 410 })
    expect(api.loginNewAccount).not.toHaveBeenCalled()
  })
}, 30000)

describe('recovery', () => {
  it('password changed, sign-in fails: the new recovery code is still returned', async () => {
    api.login.mockRejectedValue(rateLimited)
    const opened = { username: 'sam', keypair: await generateKeypair(), challenge: 'c' }
    const joined = await completeRecovery(opened, 'a new long password')
    expect(api.finishRecovery).toHaveBeenCalledOnce()
    expect(joined).toMatchObject({ signedIn: null, signInError: { status: 429 } })
    expect(joined.recoveryCode).toMatch(/\S/)
  })

  it('two-factor on: not signed in, and no error', async () => {
    api.login.mockResolvedValue({ twoFactor: { challenge: 'x', expiresAt: '' } })
    const opened = { username: 'sam', keypair: await generateKeypair(), challenge: 'c' }
    const joined = await completeRecovery(opened, 'a new long password')
    expect(joined).toMatchObject({ signedIn: null, signInError: null })
  })
}, 30000)
