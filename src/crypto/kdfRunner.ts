import type { KdfAnswer, KdfJob } from './kdf.worker'
import { getSodium } from './sodium'

// Where Argon2id runs (kdf.ts deriveKey calls this, after checking the
// parameters and the salt). In a browser: in a Web Worker (kdf.worker.ts), so
// the page stays responsive. At most two workers, so a password and a code
// derived together run side by side; each is reused for the next job and
// terminated after IDLE_MS without one, which frees its 64 MiB heap. Where
// there is no Worker (Node, so the tests) or one cannot start, on the main
// thread, with the same libsodium call.

const MAX_WORKERS = 2
const IDLE_MS = 5000

/** Whether a worker can be used at all here. Decided by the environment, not configured. */
const workersExist = () => typeof Worker !== 'undefined' && typeof window !== 'undefined'

interface Slot {
  worker: Worker
  job: { id: number; resolve: (key: Uint8Array) => void; reject: (err: Error) => void } | null
  idle: ReturnType<typeof setTimeout> | null
}

interface Queued {
  job: KdfJob
  resolve: (key: Uint8Array) => void
  reject: (err: Error) => void
}

const slots: Slot[] = []
const queue: Queued[] = []
let nextId = 1
/** Set once a worker fails to start (a strict CSP, say): the rest of the page's derivations run on the main thread. */
let workersBroken = false
let logged = false

/** Where the next derivation runs: 'worker' in a browser that allows one, else 'main'. */
export function argon2idRunsIn(): 'worker' | 'main' {
  return workersExist() && !workersBroken ? 'worker' : 'main'
}

/** Argon2id on this thread: the fallback, and what the worker itself runs. */
async function onMainThread(secret: Uint8Array, salt: Uint8Array, opslimit: number, memlimit: number, alg: number): Promise<Uint8Array> {
  const s = await getSodium()
  return s.crypto_pwhash(32, secret, salt, opslimit, memlimit, alg)
}

function maxWorkers(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1
  return Math.max(1, Math.min(MAX_WORKERS, cores))
}

function startWorker(): Slot {
  const worker = new Worker(new URL('./kdf.worker.ts', import.meta.url), { type: 'module' })
  const slot: Slot = { worker, job: null, idle: null }
  worker.onmessage = (event: MessageEvent<KdfAnswer>) => {
    const answer = event.data
    const job = slot.job
    if (!job || job.id !== answer.id) return
    slot.job = null
    if ('key' in answer) job.resolve(answer.key)
    else job.reject(new Error(answer.error))
    pump()
  }
  // A worker that cannot load (or crashes): its job, and every later one, go to the main thread.
  worker.onerror = (event) => {
    event.preventDefault()
    workersBroken = true
    const job = slot.job
    slot.job = null
    retire(slot)
    if (job) job.reject(new WorkerUnavailable())
    for (const other of slots.splice(0)) {
      if (other.job) other.job.reject(new WorkerUnavailable())
      other.worker.terminate()
    }
    for (const waiting of queue.splice(0)) waiting.reject(new WorkerUnavailable())
  }
  slots.push(slot)
  return slot
}

function retire(slot: Slot) {
  if (slot.idle) clearTimeout(slot.idle)
  slot.worker.terminate()
  const at = slots.indexOf(slot)
  if (at >= 0) slots.splice(at, 1)
}

/** Hand queued jobs to free workers (starting one if there is room); idle workers are terminated after IDLE_MS. */
function pump() {
  while (queue.length) {
    const slot = slots.find((s) => !s.job) ?? (slots.length < maxWorkers() ? startWorker() : null)
    if (!slot) break
    const { job, resolve, reject } = queue.shift()!
    if (slot.idle) clearTimeout(slot.idle)
    slot.idle = null
    slot.job = { id: job.id, resolve, reject }
    // The secret is this call's own copy: transferred, so it leaves this thread entirely.
    slot.worker.postMessage(job, [job.secret.buffer])
  }
  for (const slot of slots) {
    if (!slot.job && !slot.idle) slot.idle = setTimeout(() => retire(slot), IDLE_MS)
  }
}

class WorkerUnavailable extends Error {}

function inWorker(secret: Uint8Array, salt: Uint8Array, opslimit: number, memlimit: number, alg: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const job: KdfJob = { id: nextId++, secret: secret.slice(), salt: salt.slice(), opslimit, memlimit, alg }
    queue.push({ job, resolve, reject })
    pump()
  })
}

/**
 * Argon2id, 32 bytes. The caller still owns `secret` and wipes it: the worker
 * gets a copy, transferred, and wipes that. Parameters must already be checked.
 */
export async function argon2id(secret: Uint8Array, salt: Uint8Array, opslimit: number, memlimit: number, alg: number): Promise<Uint8Array> {
  const where = argon2idRunsIn()
  const started = performance.now()
  let key: Uint8Array
  let ranIn = where
  if (where === 'worker') {
    try {
      key = await inWorker(secret, salt, opslimit, memlimit, alg)
    } catch (err) {
      if (!(err instanceof WorkerUnavailable)) throw err
      ranIn = 'main'
      key = await onMainThread(secret, salt, opslimit, memlimit, alg)
    }
  } else {
    key = await onMainThread(secret, salt, opslimit, memlimit, alg)
  }
  // Timing only, never anything derived: a measure per run, and one line in development.
  performance.measure(`argon2id (${ranIn})`, { start: started, end: performance.now() })
  if (import.meta.env?.DEV && !logged && typeof window !== 'undefined') {
    logged = true
    console.info(`[crypto] Argon2id ran in the ${ranIn === 'worker' ? 'worker' : 'main thread'}: ${Math.round(performance.now() - started)} ms`)
  }
  return key
}
