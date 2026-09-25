// The one place libsodium is loaded. The sumo build is required: it is the
// build with Argon2id (crypto_pwhash). It is imported on first use, so public
// directory pages never download it.

type Sodium = typeof import('libsodium-wrappers-sumo')

let loading: Promise<Sodium> | null = null

/** libsodium, initialised. Every crypto function awaits this. */
export function getSodium(): Promise<Sodium> {
  loading ??= import('libsodium-wrappers-sumo').then(async (module) => {
    const sodium = (module.default ?? module) as Sodium
    await sodium.ready
    return sodium
  })
  return loading
}

/** Standard base64 with padding: the only encoding the API uses. */
export async function toBase64(bytes: Uint8Array): Promise<string> {
  const s = await getSodium()
  return s.to_base64(bytes, s.base64_variants.ORIGINAL)
}

export async function fromBase64(text: string): Promise<Uint8Array> {
  const s = await getSodium()
  return s.from_base64(text, s.base64_variants.ORIGINAL)
}

/** Overwrite key material once it is no longer needed. */
export async function wipe(...buffers: (Uint8Array | null | undefined)[]): Promise<void> {
  const s = await getSodium()
  for (const b of buffers) if (b) s.memzero(b)
}
