import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKeypair, sealPrivateKeyTo } from '../crypto'
import type { Writer } from '../types'

// The hand-off's keypair with the API faked: real encryption, no network.
vi.mock('../api/letters', () => ({ getGroupPublicKey: vi.fn() }))
vi.mock('../api/writers', () => ({ updateWriter: vi.fn(), createWriter: vi.fn() }))

const writers = await import('../api/writers')
const { handoffKeypair } = await import('./writers')

const writer = (fields: Partial<Writer>): Writer =>
  ({
    id: 1, username: 'writer-1', email: 'w@managed.example', name: 'Sam', penName: null, bio: null, role: 'user',
    chapterId: null, managedBy: 7, claimedAt: null, claimedFrom: null, anonymousForChapter: null, retentionDays: null,
    publicKey: null, claimToken: null, createdAt: '', updatedAt: '', ...fields,
  }) as Writer

const keyChange = { status: 409, name: 'KeyChangeError', condition: null, errors: [], message: 'already has keys' }

describe('handoffKeypair', () => {
  beforeEach(() => vi.mocked(writers.updateWriter).mockReset())

  it('gives a keyless writer keys, and answers what the server sealed to them', async () => {
    const group = await generateKeypair()
    vi.mocked(writers.updateWriter).mockResolvedValueOnce({ caughtUp: { sealed: 2 } } as never)
    const reread = vi.fn()
    const { keypair, caughtUp } = await handoffKeypair(writer({}), group, 7, 1, reread)
    expect(keypair.publicKey).toBeTruthy()
    expect(caughtUp).toEqual({ sealed: 2 })
    expect(reread).not.toHaveBeenCalled()
  })

  it('opens the key the housekeeping gave meanwhile when giving keys is a 409 KeyChangeError', async () => {
    const group = await generateKeypair()
    const sam = await generateKeypair()
    const keyed = writer({ publicKey: sam.publicKey, orgWrappedPrivateKey: await sealPrivateKeyTo(sam.privateKey, group.publicKey) })
    vi.mocked(writers.updateWriter).mockRejectedValueOnce(keyChange)
    const reread = vi.fn().mockResolvedValue(keyed)
    const { keypair, caughtUp } = await handoffKeypair(writer({}), group, 7, 1, reread)
    expect(reread).toHaveBeenCalledTimes(1)
    expect(keypair).toEqual(sam)
    expect(caughtUp).toBeNull()
    expect(writers.updateWriter).toHaveBeenCalledTimes(1)
  })

  it('keeps the refusal when the writer read again still has no key, or could not be read', async () => {
    const group = await generateKeypair()
    vi.mocked(writers.updateWriter).mockRejectedValueOnce(keyChange).mockRejectedValueOnce(keyChange)
    await expect(handoffKeypair(writer({}), group, 7, 1, () => Promise.resolve(writer({})))).rejects.toBe(keyChange)
    await expect(handoffKeypair(writer({}), group, 7, 1, () => Promise.reject(new Error('offline')))).rejects.toBe(keyChange)
  })

  it('does not read the writer again for any other refusal', async () => {
    const group = await generateKeypair()
    const other = { ...keyChange, status: 403, name: 'ForbiddenError' }
    vi.mocked(writers.updateWriter).mockRejectedValueOnce(other)
    const reread = vi.fn()
    await expect(handoffKeypair(writer({}), group, 7, 1, reread)).rejects.toBe(other)
    expect(reread).not.toHaveBeenCalled()
  })
})
