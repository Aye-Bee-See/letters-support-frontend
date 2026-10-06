// The reply reference (README "Reply reference"): nine digits, the last a check
// digit, printed in a letter's footer as 4827-1935-6. A prisoner copies it by
// hand onto their reply; the volunteer types it back in here. Digits only, no
// other codes. The API checks the number too; checking it here as well tells
// the volunteer about a slip of the pen before anything is sent.

import type { ApiError } from '../types'

export const REFERENCE_LENGTH = 9

/** What the volunteer typed, as digits: spaces, dashes and dots dropped, as the API does. */
export function normalizeReference(value: string): string {
  return value.replace(/[\s.\-–]/g, '')
}

/** Luhn's check digit for the eight digits before it (the API's own rule). */
function checkDigit(body: string): string {
  let sum = 0
  let double = true // the check digit is at the end, so the digit before it doubles
  for (let i = body.length - 1; i >= 0; i--) {
    let d = Number(body[i])
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return String((10 - (sum % 10)) % 10)
}

/**
 * Where a typed reference stands:
 * - `incomplete`: not nine digits yet (or something other than digits in it);
 * - `checksum`: nine digits whose check digit doesn't match, a copying mistake;
 * - `ok`: worth looking up.
 */
export function checkReference(value: string): 'incomplete' | 'checksum' | 'ok' {
  const digits = normalizeReference(value)
  if (!/^[0-9]{9}$/.test(digits)) return 'incomplete'
  return checkDigit(digits.slice(0, -1)) === digits[REFERENCE_LENGTH - 1] ? 'ok' : 'checksum'
}

/** `482719356` as `4827-1935-6`, the way it is printed. Anything that isn't nine digits comes back as typed. */
export function formatReference(value: string): string {
  const digits = normalizeReference(value)
  if (!/^[0-9]{9}$/.test(digits)) return value
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`
}

/**
 * A refused reply reference, worded from `name` and `condition` (README "Reply
 * reference"): a 400 `checksum` is a copying mistake; a 404 `unknown` is a
 * number that isn't one of this group's letters (or was never issued: the API
 * answers both the same, so numbers can't be used to fish). Null for any other error.
 */
export function describeReferenceError(e: Pick<ApiError, 'name' | 'condition'>): string | null {
  if (e.name !== 'ReplyReferenceError') return null
  if (e.condition === 'checksum') return 'That number has a mistake in it; check it against the letter.'
  return 'That number is not one of your group’s letters. Check it against the letter, or find the writer by name.'
}
