import type { Prison } from '../types'

// Display helpers for facility (prison) records.

/**
 * One line of postal address from the free-form JSON (seeds use street, city,
 * postalCode): "PO Box 2000, White Deer, PA 17887".
 */
export function addressLine(address: Prison['address'] | null | undefined): string | null {
  if (!address) return null
  const { street, city, postalCode, ...rest } = address
  const cityLine = [city, postalCode].filter(Boolean).join(' ')
  const parts = [street, cityLine, ...Object.values(rest)].filter((s) => typeof s === 'string' && s.trim())
  return parts.length ? parts.join(', ') : null
}

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })

/**
 * What a writer must follow, as sentences: the facility's mail rules (their
 * master-list wording, in master-list order) and its typed limits.
 */
export function mailRuleLines(prison: Pick<Prison, 'mail_rule_details' | 'pageLimit' | 'photoLimit' | 'mailLanguages'>): string[] {
  const lines = (prison.mail_rule_details ?? []).map((rule) => rule.label)
  if (prison.pageLimit) lines.push(`At most ${prison.pageLimit} single-sided ${prison.pageLimit === 1 ? 'page' : 'pages'} per letter`)
  if (prison.photoLimit) lines.push(`At most ${prison.photoLimit} ${prison.photoLimit === 1 ? 'photo' : 'photos'} per envelope`)
  if (prison.mailLanguages?.length) {
    const names = prison.mailLanguages.map((code) => languageNames.of(code) ?? code)
    lines.push(`Letters must be written in ${names.join(' or ')}`)
  }
  return lines
}
