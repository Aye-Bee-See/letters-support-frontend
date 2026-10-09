import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { keyFingerprint } from './fingerprint'
import { generateKeypair } from './primitives'

describe('key fingerprints', () => {
  it('matches the documented vector: SHA-256 of 32 zero bytes, first 16 bytes, groups of four', async () => {
    const zeros = Buffer.alloc(32).toString('base64')
    expect(await keyFingerprint(zeros)).toBe('6668-7aad-f862-bd77-6c8f-c18b-8e9f-8e20')
  })

  it('hashes the raw key bytes, not the base64 text', async () => {
    const { publicKey } = await generateKeypair()
    const expected = createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('hex').slice(0, 32).match(/.{4}/g)!.join('-')
    expect(await keyFingerprint(publicKey)).toBe(expected)
    expect(expected).toMatch(/^([0-9a-f]{4}-){7}[0-9a-f]{4}$/)
  })

  it('differs for different keys', async () => {
    const a = await generateKeypair()
    const b = await generateKeypair()
    expect(await keyFingerprint(a.publicKey)).not.toBe(await keyFingerprint(b.publicKey))
  })

  it('refuses anything that is not a 32-byte key', async () => {
    await expect(keyFingerprint(Buffer.alloc(31).toString('base64'))).rejects.toThrow()
  })
})
