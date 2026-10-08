import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccountKeys, unlockWithRecoveryCode, type NewAccount } from '../crypto'
import type { KeyBundle } from '../types'

// Changes to the signed-in account's own keys, with the API faked and the key
// handling real: the current password must open the key before anything is sent.

const api = vi.hoisted(() => ({ setKeys: vi.fn(), setSplitPassword: vi.fn() }))
vi.mock('../api/auth', () => api)

const { CurrentPasswordError, keysChangedElsewhere, prepareRecoveryCode } = await import('./account')

const password = 'the current password'
let account: NewAccount
let keys: KeyBundle

beforeAll(async () => {
  account = await createAccountKeys(password)
  const { publicKey, wrappedPrivateKey, kdfSalt, kdfParams } = account.keyFields
  keys = { publicKey, wrappedPrivateKey, kdfSalt, kdfParams, hasRecovery: false }
}, 30000)

beforeEach(() => {
  vi.resetAllMocks()
  api.setKeys.mockResolvedValue({})
})

describe('a new recovery code', () => {
  it('sends the password-locked fields unchanged, and a new code that opens the same key', async () => {
    const prepared = await prepareRecoveryCode(keys, password)
    expect(api.setKeys).not.toHaveBeenCalled()
    await prepared.save()
    const sent = api.setKeys.mock.calls[0][0]
    expect(sent).toMatchObject({
      publicKey: keys.publicKey,
      wrappedPrivateKey: keys.wrappedPrivateKey,
      kdfSalt: keys.kdfSalt,
      kdfParams: keys.kdfParams,
    })
    const opened = await unlockWithRecoveryCode({ ...sent, publicKey: keys.publicKey }, prepared.recoveryCode)
    expect(opened.privateKey).toBe(account.keypair.privateKey)
  })

  it('refuses a password that does not open the key, sending nothing', async () => {
    await expect(prepareRecoveryCode(keys, 'not the password')).rejects.toBeInstanceOf(CurrentPasswordError)
    expect(api.setKeys).not.toHaveBeenCalled()
  })

  it('knows a password changed elsewhere', () => {
    expect(keysChangedElsewhere({ status: 409, name: 'KeyChangeError', condition: null, errors: [], message: '' })).toBe(true)
    expect(
      keysChangedElsewhere({
        status: 400,
        name: 'ValidationError',
        condition: null,
        errors: ['kdfSalt changes only with the password'],
        message: '',
        problems: [{ field: 'kdfSalt', code: 'not_settable_here' }],
      }),
    ).toBe(true)
    expect(keysChangedElsewhere({ status: 409, name: 'AccountDeleteError', condition: null, errors: [], message: '' })).toBe(false)
  })
}, 30000)
