import { getSodium } from './sodium'

// Argon2id off the main thread (kdf.ts deriveKey). At 64 MiB one run takes
// 0.5 to 3 s on a phone; here it no longer freezes the page, two runs (a
// password and a recovery code) can go side by side in two workers, and the
// 64 MiB heap goes when the worker is terminated after a few idle seconds.
//
// The page has already checked the parameters and the salt (checkKdfParams);
// this runs exactly what it is sent. The secret arrives as a transferred copy
// and is wiped here once hashed; the key goes back transferred, so no copy of
// it stays in this worker outside libsodium's heap, which goes with the worker.

/** One derivation, as the page posts it. `secret` is the page's copy, transferred. */
export interface KdfJob {
  id: number
  secret: Uint8Array
  salt: Uint8Array
  opslimit: number
  memlimit: number
  alg: number
}

/** The answer: the 32-byte key, or why it failed. */
export type KdfAnswer = { id: number; key: Uint8Array } | { id: number; error: string }

/** What the worker does with one job: Argon2id, then the secret is wiped. Exported for the tests (Node has no Web Worker). */
export async function runKdfJob(job: KdfJob): Promise<KdfAnswer> {
  const s = await getSodium()
  try {
    return { id: job.id, key: s.crypto_pwhash(32, job.secret, job.salt, job.opslimit, job.memlimit, job.alg) }
  } catch (err) {
    return { id: job.id, error: err instanceof Error ? err.message : String(err) }
  } finally {
    s.memzero(job.secret)
  }
}

// Only inside a worker (no `window`, but a `postMessage` of its own): importing
// this file in a test or on the page installs nothing.
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = async (event: MessageEvent<KdfJob>) => {
    const answer = await runKdfJob(event.data)
    self.postMessage(answer, { transfer: 'key' in answer ? [answer.key.buffer] : [] })
  }
}
