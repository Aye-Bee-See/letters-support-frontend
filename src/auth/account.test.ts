import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccountKeys, unlockWithRecoveryCode, type NewAccount } from '../crypto'
import type { KeyBundle } from '../types'

// Changes to the signed-in account's own keys, with the API faked and the key
// handling real: the current password must open the key before anything is sent.

const api = vi.hoisted(() => ({ setKeys: vi.fn(), setSplitPassword: vi.fn(), deleteMyAccount: vi.fn() }))
vi.mock('../api/auth', () => api)

const { changePassword, CurrentPasswordError, deleteOwnAccount, fixedOnGroupKeysPage, keysChangedElsewhere, openWithPassword, ownDeleteRefusal, prepareRecoveryCode } =
  await import('./account')
const { signInKeys } = await import('../crypto')

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

describe('the account’s own keys', () => {
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

  it('changing the password: a new salt, the same key, and the fresh token handed back', async () => {
    api.setSplitPassword.mockResolvedValue({ token: { token: 'fresh', expires: 123 } })
    const changed = await changePassword(7, keys, password, 'a new long password')
    const [id, creds] = api.setSplitPassword.mock.calls[0]
    expect(id).toBe(7)
    expect(creds.kdfSalt).not.toBe(keys.kdfSalt)
    expect(creds.authKey).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(changed.token).toEqual({ token: 'fresh', expires: 123 })
    const reopened = await openWithPassword({ ...keys, ...changed.fields }, 'a new long password')
    expect(reopened.privateKey).toBe(account.keypair.privateKey)
  })

  it('changing the password refuses a wrong current one, sending nothing', async () => {
    await expect(changePassword(7, keys, 'not the password', 'a new long password')).rejects.toBeInstanceOf(CurrentPasswordError)
    expect(api.setSplitPassword).not.toHaveBeenCalled()
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

describe('deleting the account', () => {
  const refused = (condition: string | null, status = 409, name = 'AccountDeleteError') => ({ status, name, condition, errors: [], message: 'the API’s sentence' })

  it('opens the key with the password first, then sends the auth key a sign-in would send, never the password', async () => {
    api.deleteMyAccount.mockResolvedValue({ deleted: 1, letters: 3, replies: 1, attachments: 0, threads: 2 })
    const report = await deleteOwnAccount(7, keys, password)
    expect(report.letters).toBe(3)
    const [id, sent] = api.deleteMyAccount.mock.calls[0]
    expect(id).toBe(7)
    expect(sent).not.toBe(password)
    const { authKey } = await signInKeys(password, { scheme: 'split', kdfSalt: keys.kdfSalt!, kdfParams: keys.kdfParams! })
    expect(sent).toBe(authKey)
  })

  it('refuses a wrong password on the device, sending nothing', async () => {
    await expect(deleteOwnAccount(7, keys, 'not the password')).rejects.toBeInstanceOf(CurrentPasswordError)
    expect(api.deleteMyAccount).not.toHaveBeenCalled()
  })

  it('refuses a session with no keys, sending nothing', async () => {
    await expect(deleteOwnAccount(7, null, password)).rejects.toThrow(/no keys/)
    expect(api.deleteMyAccount).not.toHaveBeenCalled()
  })

  it('passes the API’s refusal on as it came', async () => {
    api.deleteMyAccount.mockRejectedValue(refused('group_owner'))
    await expect(deleteOwnAccount(7, keys, password)).rejects.toMatchObject({ status: 409, condition: 'group_owner' })
  })

  it('words each refusal to the account holder, never with the API’s sentence', () => {
    expect(ownDeleteRefusal(refused('group_owner'))).toMatch(/Pass ownership/)
    expect(ownDeleteRefusal(refused('last_key_holder'))).toMatch(/Hand the key to another group admin first/)
    expect(ownDeleteRefusal(refused('only_admin'))).toMatch(/only site admin/)
    expect(ownDeleteRefusal(refused('anonymous'))).toMatch(/anonymous/)
    expect(ownDeleteRefusal(refused('something_new'))).toMatch(/Nothing was deleted/)
    // A bare 403 here is the password, not commonRefusal's inactive group.
    expect(ownDeleteRefusal(refused(null, 403, 'AuthorizationError'))).toMatch(/isn’t your current password/)
    expect(ownDeleteRefusal({ ...refused(null, 429, 'RateLimitError'), retryAfter: 600 })).toMatch(/Wait 10 minutes/)
    for (const c of ['group_owner', 'last_key_holder', 'only_admin', 'anonymous', null]) {
      expect(ownDeleteRefusal(refused(c))).not.toMatch(/the API’s sentence/)
    }
  })

  it('knows which refusals the group’s keys page puts right', () => {
    expect(fixedOnGroupKeysPage(refused('group_owner'))).toBe(true)
    expect(fixedOnGroupKeysPage(refused('last_key_holder'))).toBe(true)
    expect(fixedOnGroupKeysPage(refused('only_admin'))).toBe(false)
    expect(fixedOnGroupKeysPage(refused(null, 403, 'AuthorizationError'))).toBe(false)
  })
}, 30000)
