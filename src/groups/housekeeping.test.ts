import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptLetter, generateKeypair, openEnvelope, unlockManagedWriterKey } from '../crypto'
import type { MissingEnvelope, Writer } from '../types'

// The housekeeping run with the API faked: real encryption, no network.
vi.mock('../api/letters', () => ({ getMissingEnvelopes: vi.fn(), addEnvelope: vi.fn(), getGroupPublicKey: vi.fn() }))
vi.mock('../api/writers', () => ({ getAllWriters: vi.fn(), updateWriter: vi.fn(), createWriter: vi.fn() }))

const letters = await import('../api/letters')
const writers = await import('../api/writers')
const { envelopesToFill, runHousekeeping } = await import('./housekeeping')
const { writersNeedingKeys } = await import('./writers')

const writer = (fields: Partial<Writer>): Writer =>
  ({
    id: 1, username: 'writer-1', email: 'w@managed.example', name: 'Sam', penName: null, bio: null, role: 'user',
    chapterId: null, managedBy: 7, claimedAt: null, claimedFrom: null, anonymousForChapter: null, retentionDays: null,
    publicKey: null, claimToken: null, createdAt: '', updatedAt: '', ...fields,
  }) as Writer

const missing = (fields: Partial<MissingEnvelope>): MissingEnvelope => ({
  message: 1, chat: 1, readerType: 'user', readerId: 1, publicKey: 'pk', wrappedKey: 'wk', keyVersion: 1, ...fields,
})

describe('which writers get keys', () => {
  it('keys unclaimed writers without a public key, never the anonymous one', () => {
    const list = [
      writer({ id: 1 }),
      writer({ id: 2, publicKey: 'already' }),
      writer({ id: 3, anonymousForChapter: 7 }),
      writer({ id: 4, claimedAt: '2026-10-01T00:00:00Z', managedBy: null }),
    ]
    expect(writersNeedingKeys(list).map((w) => w.id)).toEqual([1])
  })
})

describe('which waiting letters this session fills', () => {
  it('skips envelopes sealed to another version of the group key, and duplicates', () => {
    const list = [
      missing({ message: 1 }),
      missing({ message: 1 }),
      missing({ message: 2, keyVersion: 2 }),
      missing({ message: 3, keyVersion: null }),
      missing({ message: 4, readerId: 2 }),
    ]
    expect(envelopesToFill(list, 1).map((m) => [m.message, m.readerId])).toEqual([[1, 1], [3, 1], [4, 2]])
  })
})

describe('runHousekeeping', () => {
  beforeEach(() => {
    vi.mocked(letters.addEnvelope).mockReset()
    vi.mocked(writers.updateWriter).mockReset()
  })

  it('keys a keyless writer, then seals a waiting letter to its writer, and carries on past a failure', async () => {
    const group = await generateKeypair()
    const sam = await generateKeypair()
    const letter = await encryptLetter('Dear Noor', [{ readerType: 'chapter', readerId: 7, publicKey: group.publicKey, keyVersion: 1 }])
    const groupCopy = letter.fields.envelopes[0].wrappedKey

    vi.mocked(writers.getAllWriters).mockResolvedValue([writer({ id: 5 }), writer({ id: 6 })])
    vi.mocked(writers.updateWriter)
      .mockRejectedValueOnce({ status: 403, name: null, condition: null, errors: [], message: 'no' })
      .mockResolvedValueOnce({ updatedRows: [1], newUser: { id: 6 } })
    vi.mocked(letters.getMissingEnvelopes).mockResolvedValue([
      missing({ message: 41, readerId: 9, publicKey: sam.publicKey, wrappedKey: groupCopy }),
      missing({ message: 42, readerId: 9, publicKey: sam.publicKey, wrappedKey: 'not a sealed box' }),
    ])
    vi.mocked(letters.addEnvelope).mockResolvedValue({ id: 1, message: 41, readerType: 'user', readerId: 9, wrappedKey: '' })

    const result = await runHousekeeping({ groupId: 7, groupKeypair: group, keyVersion: 1 })
    expect(result).toEqual({ writersKeyed: 1, envelopesAdded: 1, failures: 2 })

    // The writer's private key went sealed to the group, with the version.
    const keyed = vi.mocked(writers.updateWriter).mock.calls[1]
    expect(keyed[0]).toBe(6)
    const fields = keyed[1] as { publicKey: string; orgWrappedPrivateKey: string; orgKeyVersion: number }
    expect(fields.orgKeyVersion).toBe(1)
    await expect(unlockManagedWriterKey(fields, group)).resolves.toMatchObject({ publicKey: fields.publicKey })

    // The writer's envelope opens to the letter's content key.
    const posted = vi.mocked(letters.addEnvelope).mock.calls[0][0]
    expect(posted).toMatchObject({ message: 41, readerType: 'user', readerId: 9 })
    expect(await openEnvelope(posted, sam)).toEqual(letter.contentKey)
  })

  it('swallows a failed list', async () => {
    const group = await generateKeypair()
    vi.mocked(writers.getAllWriters).mockRejectedValue(new Error('offline'))
    vi.mocked(letters.getMissingEnvelopes).mockRejectedValue(new Error('offline'))
    await expect(runHousekeeping({ groupId: 7, groupKeypair: group, keyVersion: 1 })).resolves.toEqual({
      writersKeyed: 0,
      envelopesAdded: 0,
      failures: 2,
    })
  })

  it('seals to the current group key when the group rotated (one retry on KeyVersionError)', async () => {
    const old = await generateKeypair()
    const current = await generateKeypair()
    vi.mocked(writers.getAllWriters).mockResolvedValue([writer({ id: 5 })])
    vi.mocked(writers.updateWriter)
      .mockRejectedValueOnce({ status: 409, name: 'KeyVersionError', condition: null, errors: [], message: 'rotated' })
      .mockResolvedValueOnce({ updatedRows: [1], newUser: { id: 5 } })
    vi.mocked(letters.getGroupPublicKey).mockResolvedValue({ chapter: 7, publicKey: current.publicKey, keyVersion: 2 })
    vi.mocked(letters.getMissingEnvelopes).mockResolvedValue([])
    await runHousekeeping({ groupId: 7, groupKeypair: old, keyVersion: 1 })
    const fields = vi.mocked(writers.updateWriter).mock.calls[1][1] as { orgWrappedPrivateKey: string; publicKey: string; orgKeyVersion: number }
    expect(fields.orgKeyVersion).toBe(2)
    await expect(unlockManagedWriterKey(fields, current)).resolves.toBeTruthy()
  })
})
