import type { Prison, PrisonAddress, RoutingMethod } from '../types'

// Display helpers for facility (prison) records.

/** How mail reaches the facility, in words. */
export const ROUTING_LABELS: Record<RoutingMethod, string> = {
  direct: 'Direct mail',
  scan_only: 'Scan service only',
  direct_and_scan: 'Direct mail or scan service',
  relay_only: 'Relay group only',
}

/** Routing lines for the facilities table: the method, then each relay group ("Via Belarus ABC"). */
/** A mail rule's category in words: "mail_content" → "Mail content". */
export const categoryLabel = (c: string) => (c.charAt(0).toUpperCase() + c.slice(1)).replace(/_/g, ' ')

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

const nonEmpty = (s: unknown): s is string => typeof s === 'string' && s.trim() !== ''

/** Lines composed from the structured fields: street, "city postalCode", any other string parts. */
function composedLines(address: PrisonAddress): string[] {
  const known = ['street', 'city', 'postalCode', 'lines']
  const others = Object.entries(address)
    .filter(([key]) => !known.includes(key))
    .map(([, value]) => value)
  return [address.street, [address.city, address.postalCode].filter(Boolean).join(' '), ...others].filter(nonEmpty)
}

/** The facility's own print lines, when it has them (address.lines, set per facility). */
export const printLines = (address: PrisonAddress | null | undefined): string[] | null =>
  address?.lines?.filter(nonEmpty).length ? address.lines.filter(nonEmpty) : null

/**
 * One line of postal address: the print lines joined when the facility has
 * them, otherwise composed from the fields ("PO Box 2000, White Deer, PA 17887").
 */
export function addressLine(address: PrisonAddress | null | undefined): string | null {
  if (!address) return null
  const parts = printLines(address) ?? composedLines(address)
  return parts.length ? parts.join(', ') : null
}

/**
 * The address block for the facility profile. The print lines exactly as given
 * when present (they are what goes on the envelope, in the facility's order);
 * otherwise the facility name, the composed lines and the country.
 */
export function addressLines(prison: Pick<Prison, 'address' | 'country' | 'prisonName'>): string[] {
  return (
    printLines(prison.address) ?? [prison.prisonName, ...composedLines(prison.address ?? {}), prison.country].filter(nonEmpty)
  )
}

/** Short tag beside the routing method on the facility profile. */
export const ROUTING_TAGS: Record<RoutingMethod, string> = {
  direct: 'physical letter',
  scan_only: 'scan service',
  direct_and_scan: 'physical letter or scan',
  relay_only: 'via relay group',
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
