import { toApiError } from '../api/client'
import { getKeys } from '../api/auth'
import { handMemberKey } from '../api/groups'
import { keyFingerprint, sealPrivateKeyTo, unlockGroupKey, type Keypair } from '../crypto'
import type { KeyBundle } from '../types'

// Group keys (README "Group keys"): the steps the keys page and the waiting
// admins notice share. No React here; useGroupKeyRefresh joins them to the session.

export type OrgKey = NonNullable<KeyBundle['orgKey']>

/** What every screen that hands out the group key says (group-admin-plan.md, section 3). */
export const EVERY_HOLDER =
  'Every holder of the group key can read every letter the group mails, from before and after they were handed it. Keep the group small: hand it only to group admins who need to read letters.'

/**
 * The account's group key as the API has it now: GET /auth/keys, and the group
 * keypair opened with the admin's own keypair when they hold it. A copy that
 * doesn't open (stale, or sealed wrong) counts as not held, as at sign-in.
 */
export async function fetchGroupKey(keypair: Keypair): Promise<{ orgKey: OrgKey | null; groupKeypair: Keypair | null }> {
  const bundle = await getKeys()
  const orgKey = bundle.orgKey ?? null
  if (!orgKey?.wrappedOrgPrivateKey || !orgKey.chapterPublicKey) return { orgKey, groupKeypair: null }
  const groupKeypair = await unlockGroupKey(
    { wrappedOrgPrivateKey: orgKey.wrappedOrgPrivateKey, chapterPublicKey: orgKey.chapterPublicKey },
    keypair,
  ).catch(() => null)
  return { orgKey, groupKeypair }
}

/** A group admin the key can be handed to: they have keys of their own. */
export interface KeyRecipient {
  id: number
  publicKey: string
}

/**
 * The group-owner admin hands the group key to a group admin: the group private
 * key sealed to their public key, PUT /auth/member-key with the version sealed.
 * A key rotated away meanwhile is a 409 KeyVersionError (see isStaleKey).
 */
export async function handKeyTo(chapter: number, member: KeyRecipient, groupKeypair: Keypair, keyVersion: number) {
  const wrapped = await sealPrivateKeyTo(groupKeypair.privateKey, member.publicKey)
  return handMemberKey(chapter, member.id, wrapped, keyVersion)
}

/** The group key this session holds was rotated away meanwhile: fetch it again. */
export const isStaleKey = (err: unknown) => {
  const e = toApiError(err)
  return e.status === 409 && e.name === 'KeyVersionError'
}

/** What a refusal says, for showing: the validation messages, or the message. */
export const errorText = (err: unknown) => {
  const e = toApiError(err)
  return e.errors.length ? e.errors.join(' ') : e.message
}

/** How a group admin is named on the key screens: their name and username, or the username. */
export const adminName = (m: { username: string; name: string | null }) => (m.name ? `${m.name} (${m.username})` : m.username)

/**
 * Fingerprints for the keys page (crypto/fingerprint.ts), one per distinct key:
 * key → "xxxx-xxxx-…", or null for a key that isn't a public key at all (which
 * the page says, since that alone means something is wrong).
 */
export async function fingerprintsOf(keys: (string | null | undefined)[]): Promise<Map<string, string | null>> {
  const distinct = [...new Set(keys.filter((k): k is string => !!k))]
  const pairs = await Promise.all(distinct.map(async (k) => [k, await keyFingerprint(k).catch(() => null)] as const))
  return new Map(pairs)
}
