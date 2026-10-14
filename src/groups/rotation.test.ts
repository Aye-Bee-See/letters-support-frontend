import { describe, expect, it } from 'vitest'
import { decryptLetter, encryptLetter, generateKeypair, openEnvelope, sealPrivateKeyTo, unlockGroupKey, type Keypair } from '../crypto'
import type { RotationMaterial } from '../types'
import { checkResealed, lostRotationNote, reseal, RotationError } from './rotation'

// What GET /auth/chapter-rotation would return for a group holding one letter
// and one managed writer, with three group admins: the owner (1), a holder (2),
// and one who has not signed in with keys yet (3).
async function groupWithALetter() {
  const oldGroup = await generateKeypair()
  const owner = await generateKeypair()
  const holder = await generateKeypair()
  const writer = await generateKeypair()
  const letter = await encryptLetter('Dear friend, the garden is coming up.', [
    { readerType: 'chapter', readerId: 4, publicKey: oldGroup.publicKey, keyVersion: 1 },
  ])
  const material: RotationMaterial = {
    chapter: 4,
    publicKey: oldGroup.publicKey,
    keyVersion: 1,
    envelopes: [{ id: 41, message: 9, wrappedKey: letter.fields.envelopes[0].wrappedKey }],
    writers: [{ id: 12, name: 'A writer', publicKey: writer.publicKey, orgWrappedPrivateKey: await sealPrivateKeyTo(writer.privateKey, oldGroup.publicKey) }],
    members: [
      { id: 1, username: 'owner', name: null, publicKey: owner.publicKey, holdsGroupKey: true },
      { id: 2, username: 'holder', name: null, publicKey: holder.publicKey, holdsGroupKey: true },
      { id: 3, username: 'newcomer', name: null, publicKey: null, holdsGroupKey: false },
    ],
  }
  return { oldGroup, owner, holder, writer, letter, material }
}

const groupKeyOf = async (input: { members: { user: number; wrappedOrgPrivateKey: string }[] }, user: number, member: Keypair, publicKey: string) => {
  const wrapped = input.members.find((m) => m.user === user)?.wrappedOrgPrivateKey
  if (!wrapped) throw new Error(`user ${user} was left out`)
  return unlockGroupKey({ wrappedOrgPrivateKey: wrapped, chapterPublicKey: publicKey }, member)
}

describe('reseal', () => {
  it('re-seals every envelope and writer key to the new group key, and hands it to each admin kept', async () => {
    const { oldGroup, owner, holder, letter, material } = await groupWithALetter()
    const newGroup = await generateKeypair()
    const input = await reseal(material, oldGroup, newGroup, [1, 2])

    expect(input).toMatchObject({ chapter: 4, keyVersion: 1, publicKey: newGroup.publicKey })
    expect(input.envelopes.map((e) => e.id)).toEqual([41])
    expect(input.writers.map((w) => w.id)).toEqual([12])
    expect(input.members.map((m) => m.user)).toEqual([1, 2])

    // The letter opens with the new key, and not with the old one.
    const contentKey = await openEnvelope(input.envelopes[0], newGroup)
    expect((await decryptLetter(letter.fields, contentKey)).text).toBe('Dear friend, the garden is coming up.')
    await expect(openEnvelope(input.envelopes[0], oldGroup)).rejects.toThrow()

    // The writer's private key is the same key, now sealed to the new group key.
    const writerKey = await openEnvelope({ wrappedKey: input.writers[0].orgWrappedPrivateKey }, newGroup)
    expect(writerKey).toEqual(await openEnvelope({ wrappedKey: material.writers[0].orgWrappedPrivateKey }, oldGroup))

    // Each kept admin opens the new group key with their own keypair.
    expect(await groupKeyOf(input, 1, owner, newGroup.publicKey)).toEqual(newGroup)
    expect(await groupKeyOf(input, 2, holder, newGroup.publicKey)).toEqual(newGroup)
    expect(await checkResealed(material, input, oldGroup, newGroup)).toBe(true)
  })

  it('leaves out an admin who is not kept: they cannot open the new key', async () => {
    const { oldGroup, holder, material } = await groupWithALetter()
    const newGroup = await generateKeypair()
    const input = await reseal(material, oldGroup, newGroup, [1])
    expect(input.members.map((m) => m.user)).toEqual([1])
    await expect(groupKeyOf(input, 2, holder, newGroup.publicKey)).rejects.toThrow('left out')
  })

  it('works for a group with no letters and no writers yet', async () => {
    const { oldGroup, material } = await groupWithALetter()
    const empty = { ...material, envelopes: [], writers: [] }
    const newGroup = await generateKeypair()
    const input = await reseal(empty, oldGroup, newGroup, [1, 1])
    expect(input).toMatchObject({ envelopes: [], writers: [], members: [{ user: 1 }] })
    expect(await checkResealed(empty, input, oldGroup, newGroup)).toBe(true)
  })

  it('refuses nobody kept, an admin without keys, a stranger, and a keypair that is not the group’s', async () => {
    const { oldGroup, material } = await groupWithALetter()
    const newGroup = await generateKeypair()
    const kind = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof RotationError ? e.kind : String(e)))
    expect(await kind(reseal(material, oldGroup, newGroup, []))).toBe('no_members')
    expect(await kind(reseal(material, oldGroup, newGroup, [1, 3]))).toBe('no_public_key')
    expect(await kind(reseal(material, oldGroup, newGroup, [1, 99]))).toBe('not_member')
    expect(await kind(reseal(material, newGroup, oldGroup, [1]))).toBe('wrong_key')
  })

  it('fails if something sealed to the group does not open with the old key', async () => {
    const { oldGroup, material } = await groupWithALetter()
    const stranger = await generateKeypair()
    const foreign = await encryptLetter('Not for this group.', [{ readerType: 'user', readerId: 5, publicKey: stranger.publicKey }])
    const broken = { ...material, envelopes: [{ id: 42, message: 10, wrappedKey: foreign.fields.envelopes[0].wrappedKey }] }
    await expect(reseal(broken, oldGroup, await generateKeypair(), [1])).rejects.toThrow()
  })
})

describe('checkResealed', () => {
  it('catches an envelope re-sealed to the wrong key', async () => {
    const { oldGroup, material } = await groupWithALetter()
    const newGroup = await generateKeypair()
    const input = await reseal(material, oldGroup, await generateKeypair(), [1])
    // Re-sealed to a different new key than the one about to be posted.
    expect(await checkResealed(material, { ...input, publicKey: newGroup.publicKey }, oldGroup, newGroup)).toBe(false)
  })

  it('catches an item missing from the body', async () => {
    const { oldGroup, material } = await groupWithALetter()
    const newGroup = await generateKeypair()
    const input = await reseal(material, oldGroup, newGroup, [1])
    expect(await checkResealed(material, { ...input, envelopes: [] }, oldGroup, newGroup)).toBe(false)
  })
})

describe('lostRotationNote', () => {
  it('says the rotation went through when the group key read again is the new one', () => {
    const note = lostRotationNote({ chapterPublicKey: 'NEW', keyVersion: 4 }, 'NEW')
    expect(note.ok).toBe(true)
    expect(note.text).toMatch(/^The server didn’t answer\. If the rotation went through, your browser has picked up the new key; otherwise try again\./)
    expect(note.text).toContain('It went through: the group’s key is now version 4.')
  })

  it('says it did not when the group key is still the old one', () => {
    const note = lostRotationNote({ chapterPublicKey: 'OLD', keyVersion: 3 }, 'NEW')
    expect(note.ok).toBe(false)
    expect(note.text).toContain('It didn’t go through: the group’s key is still version 3')
  })

  it('asks for a reload when the key could not be read again', () => {
    const note = lostRotationNote(null, 'NEW')
    expect(note.ok).toBe(false)
    expect(note.text).toContain('reload this page')
  })
})
