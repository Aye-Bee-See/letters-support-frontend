import type { RotationInput } from '../api/groups'
import { openEnvelope, resealTo, sealPrivateKeyTo, wipe, type Keypair } from '../crypto'
import type { RotationMaterial } from '../types'

// Rotating a group key (README "Rotating a group key"), the part that needs no
// API and no React: given what GET /auth/chapter-rotation returned, the old
// group keypair and a new one, build the POST /auth/chapter-rotation body.
// Every envelope and every managed writer's private key is opened with the old
// key and sealed to the new public key; the new group private key is sealed to
// each group admin who keeps access. Whoever is left out of `keepMembers` is
// left out of the new key: that is how a group admin is really removed.

export class RotationError extends Error {
  /** `no_members`: nobody would hold the new key; `no_public_key`: a kept admin has no keys of their own; `not_member`: a kept id isn't a group admin of this group; `wrong_key`: the old keypair isn't the group's current one. */
  readonly kind: 'no_members' | 'no_public_key' | 'not_member' | 'wrong_key'
  constructor(kind: RotationError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

/**
 * The rotation body: everything in `material` re-sealed from `oldKeypair` to
 * `newKeypair`, and the new group private key sealed to each of `keepMembers`
 * (user ids, which must be group admins in `material.members` with a public
 * key). Throws if anything sealed to the group doesn't open with `oldKeypair`.
 */
export async function reseal(
  material: RotationMaterial,
  oldKeypair: Keypair,
  newKeypair: Keypair,
  keepMembers: number[],
): Promise<RotationInput> {
  if (material.publicKey !== oldKeypair.publicKey)
    throw new RotationError('wrong_key', 'The group key in this session is not the group’s current key.')
  const keep = [...new Set(keepMembers)]
  if (keep.length === 0) throw new RotationError('no_members', 'At least one group admin has to keep the key.')

  const members: RotationInput['members'] = []
  for (const id of keep) {
    const member = material.members.find((m) => m.id === id)
    if (!member) throw new RotationError('not_member', `User ${id} is not a group admin of this group.`)
    if (!member.publicKey) throw new RotationError('no_public_key', `${member.username} has no keys of their own yet.`)
    members.push({ user: id, wrappedOrgPrivateKey: await sealPrivateKeyTo(newKeypair.privateKey, member.publicKey) })
  }

  const envelopes: RotationInput['envelopes'] = []
  for (const e of material.envelopes) envelopes.push({ id: e.id, wrappedKey: await resealTo(e.wrappedKey, oldKeypair, newKeypair.publicKey) })

  const writers: RotationInput['writers'] = []
  for (const w of material.writers)
    writers.push({ id: w.id, orgWrappedPrivateKey: await resealTo(w.orgWrappedPrivateKey, oldKeypair, newKeypair.publicKey) })

  return { chapter: material.chapter, keyVersion: material.keyVersion, publicKey: newKeypair.publicKey, envelopes, writers, members }
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i])

/**
 * The server checks that everything was re-sealed, not that it was re-sealed
 * correctly (README "Rotating a group key"), so before posting: open one
 * re-sealed item with the new keypair and check it is the same as the original
 * opened with the old one. An envelope if there is one, else a writer's key.
 * True when there was nothing to check (a group with no letters or writers yet).
 */
export async function checkResealed(
  material: RotationMaterial,
  input: RotationInput,
  oldKeypair: Keypair,
  newKeypair: Keypair,
): Promise<boolean> {
  const pairs: [string, string | undefined][] = [
    ...material.envelopes.map((e): [string, string | undefined] => [e.wrappedKey, input.envelopes.find((r) => r.id === e.id)?.wrappedKey]),
    ...material.writers.map((w): [string, string | undefined] => [w.orgWrappedPrivateKey, input.writers.find((r) => r.id === w.id)?.orgWrappedPrivateKey]),
  ]
  if (pairs.length === 0) return true
  const [before, after] = pairs[0]
  if (!after) return false
  let original: Uint8Array | null = null
  let resealed: Uint8Array | null = null
  try {
    original = await openEnvelope({ wrappedKey: before }, oldKeypair)
    resealed = await openEnvelope({ wrappedKey: after }, newKeypair)
    return same(original, resealed)
  } catch {
    return false
  } finally {
    await wipe(original, resealed)
  }
}

/**
 * What to say when the rotation's POST got no answer (status 0): the server
 * may have committed it. `after` is the group's key as GET /auth/keys has it
 * once read again (null if that failed too), `freshPublicKey` the key this
 * rotation made: the group's key being that one is how the page knows it went
 * through, and its version is what the page reports.
 */
export function lostRotationNote(
  after: { chapterPublicKey: string | null; keyVersion: number } | null,
  freshPublicKey: string,
): { ok: boolean; text: string } {
  const lead = 'The server didn’t answer. If the rotation went through, your browser has picked up the new key; otherwise try again.'
  if (!after) return { ok: false, text: `${lead} The group’s key couldn’t be read again either, so reload this page to see which happened before trying again.` }
  if (after.chapterPublicKey === freshPublicKey) return { ok: true, text: `${lead} It went through: the group’s key is now version ${after.keyVersion}.` }
  return { ok: false, text: `${lead} It didn’t go through: the group’s key is still version ${after.keyVersion}, and nothing was changed.` }
}
