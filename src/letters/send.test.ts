import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKeypair } from '../crypto'

// What sendLetter posts, with the API faked: real encryption, no network.
const posted: Record<string, unknown>[] = []
vi.mock('../api/letters', () => ({
  getGroupPublicKey: vi.fn(),
  postLetter: vi.fn(async (body: Record<string, unknown>) => {
    posted.push(body)
    return { id: 99, chat: 1 }
  }),
  uploadAttachment: vi.fn(),
}))

const { getGroupPublicKey } = await import('../api/letters')
const { sendLetter } = await import('./send')

describe('sendLetter', () => {
  beforeEach(async () => {
    posted.length = 0
    const group = await generateKeypair()
    vi.mocked(getGroupPublicKey).mockResolvedValue({ chapter: 7, publicKey: group.publicKey, keyVersion: 1 })
  })

  const draft = { prisonerId: 3, relayChapterId: 7, text: 'Hello', relayNote: '', paper: false, file: null, idempotencyKey: 'k'.repeat(32) }

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
})
