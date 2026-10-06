import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptFile, decryptLetter, generateKeypair, openEnvelope, type Keypair } from '../crypto'
import type { Envelope } from '../types'

// What recordReply posts and uploads, with the API faked: real encryption, no network.
const posted: Record<string, unknown>[] = []
const uploaded: { message: number; bytes: Uint8Array; nonce: string; idempotencyKey: string }[] = []
vi.mock('../api/letters', () => ({
  getGroupPublicKey: vi.fn(),
  getUserPublicKey: vi.fn(),
  postLetter: vi.fn(async (body: Record<string, unknown>) => {
    posted.push(body)
    return { id: 50, chat: 4, sender: 'prisoner', status: 'received', envelopes: body.envelopes }
  }),
  uploadAttachment: vi.fn(async (input: (typeof uploaded)[number]) => {
    uploaded.push(input)
    return { id: 1 }
  }),
}))

const { getGroupPublicKey, getUserPublicKey } = await import('../api/letters')
const { recordReply } = await import('./record')

describe('recordReply', () => {
  let group: Keypair
  let writer: Keypair
  beforeEach(async () => {
    posted.length = 0
    uploaded.length = 0
    group = await generateKeypair()
    writer = await generateKeypair()
    vi.mocked(getGroupPublicKey).mockResolvedValue({ chapter: 1, publicKey: group.publicKey, keyVersion: 2 })
    vi.mocked(getUserPublicKey).mockResolvedValue({ user: 9, publicKey: writer.publicKey })
  })

  const draft = { writerId: 9, text: 'Thank you for the letter.', file: null, idempotencyKey: 'r'.repeat(32) }
  const envelopes = () => posted[0].envelopes as Envelope[]

  it('files a reply by reference, sealed to the writer and the group with its key version', async () => {
    const { sealedToWriter } = await recordReply({ ...draft, reference: '4827-1935-8' }, { chapterId: 1, keypair: group })
    expect(posted[0]).toMatchObject({ sender: 'prisoner', reference: '482719358' })
    expect(posted[0]).not.toHaveProperty('user')
    expect(posted[0]).not.toHaveProperty('messageText')
    expect(envelopes().map((e) => [e.readerType, e.readerId, e.keyVersion])).toEqual([
      ['user', 9, undefined],
      ['chapter', 1, 2],
    ])
    expect(sealedToWriter).toBe(true)
    const key = await openEnvelope(envelopes()[0], writer)
    expect((await decryptLetter(posted[0] as { ciphertext: string; nonce: string }, key)).text).toBe('Thank you for the letter.')
  })

  it('files a reply by name with the writer and the prisoner', async () => {
    await recordReply({ ...draft, prisonerId: 3 }, { chapterId: 1, keypair: group })
    expect(posted[0]).toMatchObject({ sender: 'prisoner', user: 9, prisoner: 3 })
    expect(posted[0]).not.toHaveProperty('reference')
  })

  it('seals to the group alone for a writer without keys', async () => {
    vi.mocked(getUserPublicKey).mockResolvedValue({ user: 9, publicKey: null })
    const { sealedToWriter } = await recordReply({ ...draft, prisonerId: 3 }, { chapterId: 1, keypair: group })
    expect(envelopes().map((e) => e.readerType)).toEqual(['chapter'])
    expect(sealedToWriter).toBe(false)
  })

  it('records a scan alone: an empty body, and the file under the same content key', async () => {
    const scan = new File([new Uint8Array([137, 80, 78, 71])], 'reply.png', { type: 'image/png' })
    await recordReply({ ...draft, text: '  ', file: scan, prisonerId: 3 }, { chapterId: 1, keypair: group })
    const key = await openEnvelope(envelopes()[1], group)
    expect((await decryptLetter(posted[0] as { ciphertext: string; nonce: string }, key)).text).toBe('')
    expect(uploaded[0]).toMatchObject({ message: 50, idempotencyKey: `${'r'.repeat(32)}-file` })
    await expect(decryptFile(uploaded[0].bytes, uploaded[0].nonce, key)).resolves.toEqual(new Uint8Array([137, 80, 78, 71]))
  })

  it('refuses an empty reply, and one with neither a reference nor a prisoner', async () => {
    await expect(recordReply({ ...draft, text: '', prisonerId: 3 }, { chapterId: 1, keypair: group })).rejects.toThrow()
    await expect(recordReply(draft, { chapterId: 1, keypair: group })).rejects.toThrow()
    expect(posted).toHaveLength(0)
  })
})
