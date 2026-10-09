import { describe, expect, it, vi } from 'vitest'
import { encryptLetter, generateKeypair, reencryptLetter } from '../crypto'
import type { Message, StoredEnvelope } from '../types'

// openLetter with real encryption and no network (README "Sending and reading letters").
vi.mock('../api/letters', () => ({ downloadAttachment: vi.fn() }))
const { forgetReplacedKeys, openLetter } = await import('./open')

/** A letter sealed to group 1's key at `version`, as a read returns it (every envelope names its keyVersion, API #198). */
async function letterTo(publicKey: string, version: number): Promise<Message> {
  const { fields } = await encryptLetter('Hello.', [{ readerType: 'chapter', readerId: 1, publicKey, keyVersion: version }])
  const envelopes: StoredEnvelope[] = fields.envelopes.map((e) => ({ ...e, keyVersion: e.keyVersion ?? null }))
  return { id: 7, ciphertext: fields.ciphertext, nonce: fields.nonce, envelopes } as Message
}

describe('openLetter', () => {
  it('opens a group envelope with the group key', async () => {
    const group = await generateKeypair()
    const me = await generateKeypair()
    const opened = await openLetter(await letterTo(group.publicKey, 2), { userId: 5, keypair: me, chapterId: 1, groupKeypair: group, groupKeyVersion: 2 })
    expect(opened).toMatchObject({ state: 'open', text: 'Hello.' })
  })

  it('says a group envelope that won’t open was sealed under another key version', async () => {
    const old = await generateKeypair()
    const current = await generateKeypair()
    const me = await generateKeypair()
    const reader = { userId: 5, keypair: me, chapterId: 1, groupKeypair: current, groupKeyVersion: 2 }
    expect(await openLetter(await letterTo(old.publicKey, 1), reader)).toEqual({ state: 'old-key', sealedWith: 1, holding: 2 })
    // Same version and still no good: broken, not stale.
    expect(await openLetter(await letterTo(old.publicKey, 2), reader)).toEqual({ state: 'unreadable' })
    // A session that doesn't know its key version can't tell.
    expect(await openLetter(await letterTo(old.publicKey, 1), { ...reader, groupKeyVersion: null })).toEqual({ state: 'unreadable' })
  })
})

describe('forgetReplacedKeys', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  const opened = (contentKey: Uint8Array) => ({ opened: { state: 'open' as const, text: 'x', relayNote: null, contentKey } })
  const key = (n: number) => new Uint8Array(32).fill(n)
  const wiped = (k: Uint8Array) => k.every((b) => b === 0)

  it('wipes the keys a reload replaced and keeps the ones it reused', async () => {
    const kept = opened(key(1))
    const replaced = opened(key(2))
    forgetReplacedKeys([kept, replaced, { opened: { state: 'waiting' } }], [kept, opened(key(3))])
    await settle()
    expect(wiped(kept.opened.contentKey)).toBe(false)
    expect(wiped(replaced.opened.contentKey)).toBe(true)
  })

  it('wipes every key when the page goes, and nothing breaks for an empty page', async () => {
    const a = opened(key(4))
    const b = opened(key(5))
    forgetReplacedKeys([a, b])
    forgetReplacedKeys(null)
    forgetReplacedKeys([{ opened: null }, null])
    await settle()
    expect(wiped(a.opened.contentKey) && wiped(b.opened.contentKey)).toBe(true)
  })

  it('leaves a wiped key unusable for encrypting, rather than encrypting under zeros', async () => {
    const reader = await generateKeypair()
    const { contentKey } = await encryptLetter('Dear friend', [{ readerType: 'user', readerId: 1, publicKey: reader.publicKey }])
    forgetReplacedKeys([opened(contentKey)])
    await settle()
    await expect(reencryptLetter('Dear friend, edited', contentKey)).rejects.toThrow(/wiped/)
  })
})
