import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptFile, encryptLetter, generateKeypair } from '../crypto'

// What sendLetter posts and uploads, with the API faked: real encryption, no network.
const posted: Record<string, unknown>[] = []
const uploaded: { message: number; bytes: Uint8Array; nonce: string; idempotencyKey: string }[] = []
let reply: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
vi.mock('../api/letters', () => ({
  getGroupPublicKey: vi.fn(),
  postLetter: vi.fn(async (body: Record<string, unknown>) => {
    posted.push(body)
    return reply(body)
  }),
  uploadAttachment: vi.fn(async (input: (typeof uploaded)[number]) => {
    uploaded.push(input)
    return { id: 1 }
  }),
}))

const { getGroupPublicKey, uploadAttachment } = await import('../api/letters')
const { AttachmentNotUploaded, MAX_FILE_BYTES, sendLetter, uploadLetterFile } = await import('./send')

describe('sendLetter', () => {
  beforeEach(async () => {
    posted.length = 0
    uploaded.length = 0
    // A new letter: the API answers with the letter as sent, envelopes included.
    reply = async (body) => ({ id: 99, chat: 1, envelopes: body.envelopes })
    vi.mocked(uploadAttachment).mockClear()
    const group = await generateKeypair()
    vi.mocked(getGroupPublicKey).mockResolvedValue({ chapter: 7, publicKey: group.publicKey, keyVersion: 1 })
  })

  const draft = { prisonerId: 3, relayChapterId: 7, text: 'Hello', relayNote: '', paper: false, file: null, idempotencyKey: 'k'.repeat(32) }
  const scan = () => new File([new Uint8Array([1, 2, 3, 4])], 'scan.pdf', { type: 'application/pdf' })

  it('sends a letter written again as resendOf the returned or declined one', async () => {
    const writer = { userId: 2, keypair: await generateKeypair() }
    await sendLetter({ ...draft, resendOf: 41 }, writer)
    expect(posted[0]).toMatchObject({ sender: 'user', prisoner: 3, relayChapter: 7, resendOf: 41 })
    expect(posted[0]).not.toHaveProperty('messageText')
  })

  it('leaves resendOf out of an ordinary letter', async () => {
    const writer = { userId: 2, keypair: await generateKeypair() }
    await sendLetter(draft, writer)
    expect(posted[0]).not.toHaveProperty('resendOf')
  })

  it('encrypts the file with the key of the letter the API returns, when a retry gets the first attempt’s letter back', async () => {
    const writer = { userId: 2, keypair: await generateKeypair() }
    // The first attempt's letter, sealed with its own content key.
    const first = await encryptLetter('Hello', [{ readerType: 'user', readerId: 2, publicKey: writer.keypair.publicKey }])
    reply = async () => ({ id: 98, chat: 1, envelopes: first.fields.envelopes })
    await sendLetter({ ...draft, file: scan() }, writer)
    const file = uploaded[0]
    expect(file.message).toBe(98)
    await expect(decryptFile(file.bytes, file.nonce, first.contentKey)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('says the letter was sent when only the file failed, and the file can be retried with the same key', async () => {
    const writer = { userId: 2, keypair: await generateKeypair() }
    vi.mocked(uploadAttachment).mockRejectedValueOnce(new Error('network'))
    const failure = await sendLetter({ ...draft, file: scan() }, writer).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(AttachmentNotUploaded)
    const { letter, contentKey } = failure as InstanceType<typeof AttachmentNotUploaded>
    expect(letter.id).toBe(99)
    expect(posted).toHaveLength(1)

    await uploadLetterFile(letter, scan(), contentKey, draft.idempotencyKey)
    const retried = uploaded[uploaded.length - 1]
    expect(retried.idempotencyKey).toBe(`${draft.idempotencyKey}-file`)
    await expect(decryptFile(retried.bytes, retried.nonce, contentKey)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('refuses a file that would be over the upload limit once encrypted', async () => {
    const writer = { userId: 2, keypair: await generateKeypair() }
    const big = new File([new Uint8Array(1)], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: MAX_FILE_BYTES + 1 })
    await expect(sendLetter({ ...draft, file: big }, writer)).rejects.toThrow(/too large/)
    expect(posted).toHaveLength(0)
    expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024 - 16)
  })
})

describe('sendLetter for a group, as one of its writers', () => {
  const groups = new Map<number, { publicKey: string; privateKey: string }>()
  beforeEach(async () => {
    posted.length = 0
    reply = async (body) => ({ id: 99, chat: 1, envelopes: body.envelopes })
    groups.set(7, await generateKeypair())
    groups.set(8, await generateKeypair())
    vi.mocked(getGroupPublicKey).mockImplementation(async (chapter: number) => ({ chapter, publicKey: groups.get(chapter)!.publicKey, keyVersion: chapter === 7 ? 3 : 1 }))
  })

  const draft = { prisonerId: 3, relayChapterId: 7, text: 'Hello', relayNote: '', paper: false, file: null, idempotencyKey: 'k'.repeat(32) }
  const envelopes = () => (posted[0].envelopes as { readerType: string; readerId: number; keyVersion?: number }[]).map((e) => [e.readerType, e.readerId, e.keyVersion ?? null])

  it('seals to the managed writer and the group, and names the writer', async () => {
    const sam = await generateKeypair()
    await sendLetter(draft, { groupId: 7, groupKeypair: groups.get(7)!, writer: { id: 12, publicKey: sam.publicKey } })
    expect(posted[0]).toMatchObject({ sender: 'user', user: 12, relayChapter: 7 })
    // The group mails it itself: one group envelope.
    expect(envelopes()).toEqual([['user', 12, null], ['chapter', 7, 3]])
  })

  it('adds the relay group when another group mails it', async () => {
    const sam = await generateKeypair()
    await sendLetter({ ...draft, relayChapterId: 8, paper: true }, { groupId: 7, groupKeypair: groups.get(7)!, writer: { id: 12, publicKey: sam.publicKey } })
    expect(posted[0]).toMatchObject({ user: 12, relayChapter: 8, paper: true })
    expect(envelopes()).toEqual([['user', 12, null], ['chapter', 7, 3], ['chapter', 8, 1]])
  })

  it('leaves out the writer envelope for a writer without keys, and `user` for the anonymous writer', async () => {
    await sendLetter(draft, { groupId: 7, groupKeypair: groups.get(7)!, writer: { id: 12, publicKey: null } })
    expect(posted[0]).toMatchObject({ user: 12 })
    expect(envelopes()).toEqual([['chapter', 7, 3]])
    posted.length = 0
    await sendLetter({ ...draft, relayChapterId: 8 }, { groupId: 7, groupKeypair: groups.get(7)!, writer: null })
    expect(posted[0]).not.toHaveProperty('user')
    expect(envelopes()).toEqual([['chapter', 7, 3], ['chapter', 8, 1]])
  })

  it('encrypts the file with the stored letter’s key, opened with the group key, on a retry', async () => {
    const first = await encryptLetter('Hello', [{ readerType: 'chapter', readerId: 7, publicKey: groups.get(7)!.publicKey, keyVersion: 3 }])
    reply = async () => ({ id: 98, chat: 1, envelopes: first.fields.envelopes })
    const scan = new File([new Uint8Array([5, 6])], 'scan.pdf', { type: 'application/pdf' })
    await sendLetter({ ...draft, file: scan }, { groupId: 7, groupKeypair: groups.get(7)!, writer: null })
    const file = uploaded[uploaded.length - 1]
    await expect(decryptFile(file.bytes, file.nonce, first.contentKey)).resolves.toEqual(new Uint8Array([5, 6]))
  })
})
