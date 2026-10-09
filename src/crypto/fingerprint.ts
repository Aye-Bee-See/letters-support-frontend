import { fromBase64, getSodium } from './sodium'

// Key fingerprints, for group admins to compare out of band (web audit 8 Oct,
// section 6: every public key comes from the server unchecked, so a tampered
// server could hand out its own). Neither phone app shows one yet; this is the
// format they should match if they do:
//
//   SHA-256 of the raw 32-byte X25519 public key (not of its base64), the first
//   16 bytes as lowercase hex, in eight groups of four joined by hyphens:
//   "6668-7aad-f862-bd77-6c8f-c18b-8e9f-8e20" for 32 zero bytes.
//
// 128 bits is far beyond what a server could match by trying keys, and eight
// groups can be read aloud and compared by eye.

/** The fingerprint of a base64 public key. Throws for anything that isn't a 32-byte key. */
export async function keyFingerprint(publicKey: string): Promise<string> {
  const s = await getSodium()
  const raw = await fromBase64(publicKey)
  if (raw.length !== s.crypto_box_PUBLICKEYBYTES) throw new Error('Not a public key.')
  const hex = s.to_hex(s.crypto_hash_sha256(raw)).slice(0, 32)
  return hex.match(/.{4}/g)!.join('-')
}
