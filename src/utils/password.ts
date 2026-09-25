// The password rule is the clients' job (the API only sees the auth key).
// Agreed 22 September: at least 10 characters, plus a strength meter. Android
// and iOS apply the same rule.

export const MIN_PASSWORD_LENGTH = 10

export type Strength = 'weak' | 'fair' | 'good' | 'strong'

/**
 * The prototype's meter (solidarity-site/claim.html checkStrength), with its
 * "too short" floor raised to the agreed minimum. Returns null for an empty field.
 */
export function passwordStrength(pw: string): { level: Strength; label: string } | null {
  if (!pw) return null
  if (pw.length < MIN_PASSWORD_LENGTH) return { level: 'weak', label: `Too short (at least ${MIN_PASSWORD_LENGTH} characters)` }
  if (pw.length < 12 || !/[^a-zA-Z0-9]/.test(pw)) return { level: 'fair', label: 'Fair — add symbols or length' }
  if (pw.length < 16) return { level: 'good', label: 'Good' }
  return { level: 'strong', label: 'Strong' }
}
