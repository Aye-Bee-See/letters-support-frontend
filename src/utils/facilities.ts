import type { Prison, RoutingMethod } from '../types'

// Display helpers for facility (prison) records.

/** How mail reaches the facility, in words. */
export const ROUTING_LABELS: Record<RoutingMethod, string> = {
  direct: 'Direct mail',
  scan_only: 'Scan service only',
  direct_and_scan: 'Direct mail or scan service',
  relay_only: 'Relay group only',
}

/** Routing lines for the facilities table: the method, then each relay group ("Via Belarus ABC"). */
export function routingLines(prison: Pick<Prison, 'routing' | 'relay_groups'>): string[] {
  const lines = prison.routing ? [ROUTING_LABELS[prison.routing]] : []
  for (const group of prison.relay_groups ?? []) lines.push(`Via ${group.name}`)
  return lines
}

/** A record is stale when never verified, or verified more than this long ago (the API's STALE_AFTER_DAYS). */
const STALE_AFTER_DAYS = 183

export function isStale(verifiedAt: string | null | undefined): boolean {
  if (!verifiedAt) return true
  return Date.now() - new Date(verifiedAt).getTime() > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

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

/** Short restriction phrases for the facilities table: "No polaroids · Max 10 pages · English or Spanish only". */
export function restrictionPhrases(prison: Pick<Prison, 'mail_rule_details' | 'pageLimit' | 'photoLimit' | 'mailLanguages'>): string[] {
  const phrases = (prison.mail_rule_details ?? []).map((rule) => rule.label)
  if (prison.pageLimit) phrases.push(`Max ${prison.pageLimit} ${prison.pageLimit === 1 ? 'page' : 'pages'}`)
  if (prison.photoLimit) phrases.push(`Max ${prison.photoLimit} ${prison.photoLimit === 1 ? 'photo' : 'photos'}`)
  if (prison.mailLanguages?.length) {
    phrases.push(`${prison.mailLanguages.map((code) => languageNames.of(code) ?? code).join(' or ')} only`)
  }
  return phrases
}

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
