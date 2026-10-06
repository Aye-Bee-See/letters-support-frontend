import { addEnvelope, getMissingEnvelopes } from '../api/letters'
import { getAllWriters } from '../api/writers'
import { envelopeFor, forgetContentKey, openEnvelope, type Keypair } from '../crypto'
import type { MissingEnvelope } from '../types'
import { giveWriterKeys, writersNeedingKeys } from './writers'

// Quiet work a group admin's browser does once per session, after sign-in, when
// it holds the group key (README "Latecomers" and "Sending and reading letters":
// "Group clients should do this quietly after sign-in"). The apps do the same at
// launch.
//
// 1. Unclaimed writers with no keys (made before encryption) get a keypair made
//    here, the private half sealed to the group (PUT /auth/user). The server
//    then seals to them the letters it still holds.
// 2. Letters stored for the group alone, because their writer had no keys when
//    they were written (web issue #4's "waiting" letters), get the writer's
//    envelope: open the group's copy of the content key, seal it to the writer,
//    POST /messaging/envelope.
//
// Nothing is shown and nothing is thrown: whatever fails is tried again next
// session. Step 1 runs first so the writers it keys are in step 2's list.

export interface HousekeepingInput {
  groupId: number
  /** The group keypair open in this session. */
  groupKeypair: Keypair
  /** The version of that keypair: a group envelope sealed to another can't be opened with it. */
  keyVersion: number
}

export interface HousekeepingResult {
  writersKeyed: number
  envelopesAdded: number
  failures: number
}

/**
 * The waiting letters this session can fill: sealed to the group key it holds
 * (an envelope from before a rotation names an older version, and won't open),
 * one per letter and writer.
 */
export function envelopesToFill(missing: MissingEnvelope[], keyVersion: number): MissingEnvelope[] {
  const seen = new Set<string>()
  return missing.filter((m) => {
    const key = `${m.message}:${m.readerId}`
    if (seen.has(key) || !m.publicKey || !m.wrappedKey) return false
    if (m.keyVersion !== null && m.keyVersion !== undefined && m.keyVersion !== keyVersion) return false
    seen.add(key)
    return true
  })
}

/** Seal one waiting letter's content key to its writer. */
async function fill(m: MissingEnvelope, groupKeypair: Keypair) {
  const contentKey = await openEnvelope({ wrappedKey: m.wrappedKey }, groupKeypair)
  try {
    const envelope = await envelopeFor(contentKey, { readerType: 'user', readerId: m.readerId, publicKey: m.publicKey })
    await addEnvelope({ message: m.message, readerType: 'user', readerId: m.readerId, wrappedKey: envelope.wrappedKey })
  } finally {
    await forgetContentKey(contentKey)
  }
}

/** Both steps, each item on its own: one that fails doesn't stop the rest. */
export async function runHousekeeping({ groupId, groupKeypair, keyVersion }: HousekeepingInput): Promise<HousekeepingResult> {
  const result: HousekeepingResult = { writersKeyed: 0, envelopesAdded: 0, failures: 0 }
  const known = { publicKey: groupKeypair.publicKey, keyVersion }

  try {
    for (const writer of writersNeedingKeys(await getAllWriters())) {
      try {
        await giveWriterKeys(writer.id, groupId, known)
        result.writersKeyed++
      } catch {
        result.failures++
      }
    }
  } catch {
    result.failures++
  }

  try {
    for (const m of envelopesToFill(await getMissingEnvelopes(), keyVersion)) {
      try {
        await fill(m, groupKeypair)
        result.envelopesAdded++
      } catch {
        result.failures++
      }
    }
  } catch {
    result.failures++
  }

  return result
}
