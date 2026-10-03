import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaimInfo } from '../api/auth'
import { createClaimToken, generateKeypair } from '../crypto'

// What claim posts for the pen name, with the API faked: real key handling, no network.
const posted: Record<string, unknown>[] = []
vi.mock('../api/auth', () => ({
  claimAccount: vi.fn(async (body: Record<string, unknown>) => {
    posted.push(body)
  }),
  loginNewAccount: vi.fn(async () => ({ token: { token: 't', expires: 0 }, user: {}, keys: {} })),
  getKeys: vi.fn(),
}))

const { claim } = await import('./claim')

describe('claim', () => {
  let token: string
  let base: ClaimInfo

  beforeAll(async () => {
    const writer = await generateKeypair()
    const material = await createClaimToken(writer.privateKey)
    token = material.token
    base = {
      writer: { id: 5, name: 'Sam', penName: null },
      chapter: { id: 1, name: 'Test Chapter' },
      expiresAt: '2026-10-16T00:00:00.000Z',
      publicKey: writer.publicKey,
      claimWrappedPrivateKey: material.fields.claimWrappedPrivateKey,
      claimSalt: material.fields.claimSalt,
      claimKdfParams: material.fields.claimKdfParams,
    }
  })
  beforeEach(() => {
    posted.length = 0
  })

  const input = (penName: string) => ({ token, username: 'sam', penName, password: 'a long enough password' })

  it('sends the pen name chosen when the group gave none', async () => {
    await claim(base, input('  Sam Rivers '))
    expect(posted[0]).toMatchObject({ penName: 'Sam Rivers' })
  })

  it('leaves out the pen name the group gave, when the writer keeps it', async () => {
    await claim({ ...base, writer: { ...base.writer, penName: 'James Hollow' } }, input('James Hollow'))
    expect(posted[0].penName).toBeUndefined()
  })

  it('leaves it out too when retyped in another case or spacing (the API counts it as the same name)', async () => {
    await claim({ ...base, writer: { ...base.writer, penName: 'James Hollow' } }, input(' james  HOLLOW '))
    expect(posted[0].penName).toBeUndefined()
  })

  it('sends a pen name the writer chose instead of the group’s', async () => {
    await claim({ ...base, writer: { ...base.writer, penName: 'James Hollow' } }, input('Sam Rivers'))
    expect(posted[0]).toMatchObject({ penName: 'Sam Rivers' })
  })
}, 30000)
