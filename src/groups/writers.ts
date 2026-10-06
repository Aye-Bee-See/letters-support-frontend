import { toApiError } from '../api/client'
import { getGroupPublicKey } from '../api/letters'
import { createWriter, updateWriter, type NewWriter } from '../api/writers'
import { generateKeypair, sealPrivateKeyTo } from '../crypto'
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

/** A fresh keypair for a writer: the public key, and the private key sealed to the group. */
export async function newWriterKeys(group: GroupPublicKey) {
  const keypair = await generateKeypair()
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
export function createKeyedWriter(
  groupId: number,
  known: GroupPublicKey,
  fields: Omit<NewWriter, 'publicKey' | 'orgWrappedPrivateKey' | 'orgKeyVersion'>,
) {
  return withCurrentGroupKey(groupId, known, async (key) => createWriter({ ...fields, ...(await newWriterKeys(key)) }))
}

/**
 * Give an unclaimed writer made before encryption their first keys (PUT /auth/user,
 * README "Latecomers"); the server then seals to them the letters it still holds.
 * Only a group admin holding the group key may (a 403 otherwise).
 */
export function giveWriterKeys(writerId: number, groupId: number, known: GroupPublicKey) {
  return withCurrentGroupKey(groupId, known, async (key) => updateWriter(writerId, await newWriterKeys(key)))
}

/** The group's shared anonymous writer: listed with the others, never handed off, never keyed. */
export const isAnonymousWriter = (w: Pick<Writer, 'anonymousForChapter'>) => w.anonymousForChapter !== null && w.anonymousForChapter !== undefined

/** Unclaimed managed writers who still need keys: made before encryption, not the anonymous one. */
export const writersNeedingKeys = <W extends Pick<Writer, 'publicKey' | 'anonymousForChapter' | 'managedBy' | 'claimedAt'>>(writers: W[]) =>
  writers.filter((w) => !w.publicKey && !isAnonymousWriter(w) && w.managedBy !== null && !w.claimedAt)

/** What to call a writer on the group's pages: pen name, else name, else the username. */
export const writerLabel = (w: Pick<Writer, 'penName' | 'name' | 'username' | 'anonymousForChapter'>) =>
  isAnonymousWriter(w) ? 'Anonymous writer' : w.penName || w.name || w.username
