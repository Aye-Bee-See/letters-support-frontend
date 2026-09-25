import { normalizeCode } from './kdf'
import { sha256Hex } from './primitives'
import { getSodium } from './sodium'

// Typed codes: recovery codes (made here, never sent) and claim tokens (made by
// the group's browser in end-to-end mode; the server stores only the hash).
// Crockford base32: 0-9 A-Z without I L O U, so a misread O or I/L still
// normalises to the right character (answers-for-web-2026-09-24.md item 5).

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 24 characters = 120 bits. Recovery codes and claim tokens use this length. */
export const CODE_LENGTH = 24

/** Invite codes are 12 characters, shown XXXX-XXXX-XXXX (made by the API). */
export const INVITE_CODE_LENGTH = 12

/**
 * A random code. 256 is a multiple of 32, so taking each byte mod 32 is
 * unbiased.
 */
export async function generateCode(length = CODE_LENGTH): Promise<string> {
  const s = await getSodium()
  const bytes = s.randombytes_buf(length)
  let code = ''
  for (const b of bytes) code += CROCKFORD[b % 32]
  s.memzero(bytes)
  return code
}

/**
 * For display and printing: groups of four, "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX".
 * Grouping is cosmetic: every use normalises the code first.
 */
export function formatCode(code: string, group = 4): string {
  return (normalizeCode(code).match(new RegExp(`.{1,${group}}`, 'g')) ?? []).join('-')
}

/** What the API stores for a claim token: SHA-256 hex of the normalised token. */
export const hashCode = (code: string): Promise<string> => sha256Hex(normalizeCode(code))
