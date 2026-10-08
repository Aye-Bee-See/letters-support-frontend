import { toApiError } from '../api/client'
import { getGroupPublicKey } from '../api/letters'
import type { CaughtUp } from '../api/groups'
import { createWriter, updateWriter, type NewWriter } from '../api/writers'
import { generateKeypair, sealPrivateKeyTo, type Keypair } from '../crypto'
import type { Writer } from '../types'

// A group's managed writers in end-to-end mode (README "Managed writers and
// claiming", "Latecomers"). The group's browser makes each writer's keypair and
// seals the private half to the group's public key, so any group admin holding
// the group key can read, print and write for the writer, and later hand the key
// on with a claim token. The server only ever stores the sealed copy.

/** The group's public key and the version anything sealed to it names. */
export interface GroupPublicKey {
  publicKey: string
  keyVersion: number
}

/** A writer's keypair as the API stores it: the public key, and the private key sealed to the group. */
export async function writerKeyFields(keypair: Keypair, group: GroupPublicKey) {
  return {
    publicKey: keypair.publicKey,
    orgWrappedPrivateKey: await sealPrivateKeyTo(keypair.privateKey, group.publicKey),
    orgKeyVersion: group.keyVersion,
  }
}

/**
 * Run a write that seals something to the group key; if the group rotated its
 * key meanwhile (409 KeyVersionError, README "Group keys"), fetch the current
 * public key and run it once more, sealed afresh.
 */
export async function withCurrentGroupKey<T>(groupId: number, known: GroupPublicKey, write: (key: GroupPublicKey) => Promise<T>): Promise<T> {
  try {
    return await write(known)
  } catch (err) {
    const e = toApiError(err)
    if (e.status !== 409 || e.name !== 'KeyVersionError') throw err
    const current = await getGroupPublicKey(groupId)
    if (!current.publicKey) throw err
    return write({ publicKey: current.publicKey, keyVersion: current.keyVersion })
  }
}

/** POST /auth/writer with a keypair made here, sealed to the group (README "Managed writers and claiming"). */
export async function createKeyedWriter(
  groupId: number,
  known: GroupPublicKey,
  fields: Omit<NewWriter, 'publicKey' | 'orgWrappedPrivateKey' | 'orgKeyVersion'>,
) {
  const keypair = await generateKeypair()
  return withCurrentGroupKey(groupId, known, async (key) => createWriter({ ...fields, ...(await writerKeyFields(keypair, key)) }))
}

/**
 * Give an unclaimed writer made before encryption their first keys (PUT /auth/user,
 * README "Latecomers"); the server then seals to them the letters it still holds.
 * Only a group admin holding the group key may (a 403 otherwise). Answers the
 * new keypair, for a hand-off that goes straight on to a claim token (drop it
 * after), and `caughtUp`, what the server sealed to them (API #194): null once
 * it holds no keys, or from an older API that didn't say.
 */
export async function giveWriterKeys(writerId: number, groupId: number, known: GroupPublicKey): Promise<{ keypair: Keypair; caughtUp: CaughtUp }> {
  const keypair = await generateKeypair()
  const answer = await withCurrentGroupKey(groupId, known, async (key) => updateWriter(writerId, await writerKeyFields(keypair, key)))
  return { keypair, caughtUp: answer?.caughtUp ?? null }
}

/**
 * A refusal from the managed-writer endpoints, in words. Keyed on status, `name`
 * and `condition` (README "Errors"), never on the sentence; a 400 shows the
 * API's own sentences, which name the field.
 */
export function describeWriterError(err: unknown): string {
  const e = toApiError(err)
  if (e.status === 0) return e.message === 'Could not reach the server.' ? 'Couldn’t reach the server. Check the connection and try again.' : e.message
  if (e.status === 400) return e.errors.length ? e.errors.join(' ') : e.message
  if (e.status === 409 && e.name === 'KeyVersionError')
    return 'Your group’s key changed while this was being saved. Sign in again to pick up the new key, then try again.'
  if (e.status === 409 && e.name === 'ClaimError')
    return 'This is your group’s anonymous writer, shared by everyone the group writes for. It can never be handed to one person.'
  if (e.status === 409 && e.name === 'AccountDeleteError')
    return e.condition === 'anonymous'
      ? 'Your group’s anonymous writer can’t be deleted: it holds the anonymous letters of everyone the group writes for.'
      : 'This account can’t be deleted.'
  if (e.status === 409 && e.name === 'KeyChangeError') return 'This writer already has keys, and they can’t change.'
  if (e.status === 409) return 'This writer is no longer one of your group’s unclaimed writers: they may have claimed their account.'
  if (e.status === 404) return 'This writer is no longer one of your group’s: they may have claimed their account, or been deleted.'
  if (e.status === 403)
    return 'Your group can’t do this right now. Only a group admin of an active group may, and giving a writer keys needs the group key.'
  if (e.status === 429) return 'Too many tries in a row. Wait a minute and try again.'
  return e.message
}

/** The group's shared anonymous writer: listed with the others, never handed off, never keyed. */
export const isAnonymousWriter = (w: Pick<Writer, 'anonymousForChapter'>) => w.anonymousForChapter !== null && w.anonymousForChapter !== undefined

/** Unclaimed managed writers who still need keys: made before encryption, not the anonymous one. */
export const writersNeedingKeys = <W extends Pick<Writer, 'publicKey' | 'anonymousForChapter' | 'managedBy' | 'claimedAt'>>(writers: W[]) =>
  writers.filter((w) => !w.publicKey && !isAnonymousWriter(w) && w.managedBy !== null && !w.claimedAt)
