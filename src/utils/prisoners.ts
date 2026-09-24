import type { Prisoner, PrisonerStatus, PrisonSummary } from '../types'

/** On-screen words for the API's status values. */
export const STATUS_LABELS: Record<PrisonerStatus, string> = {
  pretrial: 'Pretrial',
  incarcerated: 'Incarcerated',
  free: 'Released',
}

/** "14 July 2021", or null. */
export function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** "14 Jul 2021", or null. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// Display helpers for prisoner records, shared by tiles, the index and the profile.

/** The name the person goes by. */
export function displayName(p: Pick<Prisoner, 'chosenName' | 'birthName'>): string {
  return p.chosenName || p.birthName || 'Name not listed'
}

/** Other names: the birth name when it differs from the chosen one, then aliases. */
export function otherNames(p: Pick<Prisoner, 'chosenName' | 'birthName' | 'aliases'>): string[] {
  const shown = displayName(p)
  const names = [p.birthName, ...(p.aliases ?? [])].filter((n): n is string => !!n && n !== shown)
  return [...new Set(names)]
}

/** "IK-20 (Penal Colony No. 20), Mozyr, Belarus", or null when no facility is listed. */
export function heldAt(prison: PrisonSummary | null | undefined): string | null {
  if (!prison) return null
  return [prison.prisonName, prison.country].filter(Boolean).join(', ')
}

/** Year of an ISO date, or null. */
export function yearOf(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear()
}

/** Free-text estimate if given, else the year of a precise release date. */
export function estimatedRelease(p: Pick<Prisoner, 'estimatedRelease' | 'releaseDate'>): string | null {
  return p.estimatedRelease || (yearOf(p.releaseDate)?.toString() ?? null)
}
