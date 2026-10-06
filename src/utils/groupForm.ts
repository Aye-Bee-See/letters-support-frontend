import type { GroupFields } from '../api/groups'
import type { Chapter, ChapterService, NetworkRole, SocialLinkKey } from '../types'
import { SERVICE_LABELS } from './groups'

// The group record as a form: shared by the site admin's page
// (pages/admin/EditGroup.tsx) and a group admin's own (pages/org/OrgSettings.tsx).
// The fields are README "Chapters" > "Chapter fields", the ones a group may set
// on its own record with PUT /chapter/chapter. Only changed fields are sent;
// `location` and `socialLinks` are JSON values, so they go whole. The fields
// only a site admin sets (accountStatus, recordStatus, vouchedBy) stay in
// EditGroup.tsx.

export const ROLES: Record<NetworkRole, string> = {
  collecting: 'Collects letters (forwards them to relay groups)',
  relay: 'Prints and mails letters',
  both: 'Collects, prints and mails',
}
export const SERVICES = Object.keys(SERVICE_LABELS) as ChapterService[]
export const SOCIAL: Record<SocialLinkKey, string> = { instagram: 'Instagram', mastodon: 'Mastodon', bluesky: 'Bluesky', x: 'X', youtube: 'YouTube' }
export const SOCIAL_KEYS = Object.keys(SOCIAL) as SocialLinkKey[]
/** location keys the form edits; any others the record has are kept. */
export const LOCATION_KEYS = ['street', 'city', 'postalCode']
/** README "Chapter fields": lettersSent stays null, and off the public page, until it reaches this. */
export const LETTERS_SHOWN_FROM = 20

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export interface GroupFormValues {
  name: string
  street: string
  city: string
  postalCode: string
  subregion: string
  country: string
  about: string
  announcement: string
  website: string
  email: string
  social: Record<SocialLinkKey, string>
  networkRole: NetworkRole
  lettersSentBefore: string
}

export function toForm(g: Chapter): GroupFormValues {
  const loc = g.location ?? {}
  return {
    name: g.name,
    street: loc.street ?? '',
    city: loc.city ?? '',
    postalCode: loc.postalCode ?? '',
    subregion: g.subregion ?? '',
    country: g.country ?? '',
    about: g.about ?? '',
    announcement: g.announcement ?? '',
    website: g.website ?? '',
    email: g.email ?? '',
    social: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, g.socialLinks?.[k] ?? ''])) as Record<SocialLinkKey, string>,
    networkRole: g.networkRole,
    lettersSentBefore: String(g.lettersSentBefore ?? 0),
  }
}

export function buildLocation(original: Record<string, string>, v: GroupFormValues): Record<string, string> {
  const out = Object.fromEntries(Object.entries(original).filter(([key]) => !LOCATION_KEYS.includes(key)))
  for (const key of ['street', 'city', 'postalCode'] as const) if (v[key].trim()) out[key] = v[key].trim()
  return out
}

/** Only the links that are set; an empty object when none are. */
export const buildSocial = (v: GroupFormValues) =>
  Object.fromEntries(SOCIAL_KEYS.filter((k) => v.social[k].trim()).map((k) => [k, v.social[k].trim()]))

/** Problems the API would refuse, said before the request. */
export function problems(v: GroupFormValues): string[] {
  const out: string[] = []
  if (!v.name.trim()) out.push('The group needs a name.')
  // http:// is accepted on purpose: the API takes any URL, and requiring https would
  // block every other edit to a group whose stored website is http.
  if (v.website.trim() && !/^https?:\/\/\S+\.\S+/.test(v.website.trim()))
    out.push('The website must be a full address, starting with https:// (or http://).')
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) out.push('The email address doesn’t look right.')
  const before = v.lettersSentBefore.trim()
  if (before && !(/^\d+$/.test(before) && Number.isSafeInteger(Number(before)))) out.push('Letters sent before joining must be a whole number, 0 or more.')
  return out
}

/** The fields that differ from what the form started with, as PUT /chapter/chapter takes them. */
export function changes(g: Chapter, initial: GroupFormValues, v: GroupFormValues, services: Set<ChapterService>): GroupFields {
  const out: GroupFields = {}
  const text = (s: string) => s.trim() || null
  if (v.name.trim() !== initial.name.trim()) out.name = v.name.trim()
  for (const key of ['subregion', 'country', 'about', 'announcement', 'website', 'email'] as const)
    if (v[key].trim() !== initial[key].trim()) out[key] = text(v[key])
  const location = buildLocation(g.location ?? {}, v)
  if (JSON.stringify(location) !== JSON.stringify(buildLocation(g.location ?? {}, initial))) out.location = location
  const social = buildSocial(v)
  if (JSON.stringify(social) !== JSON.stringify(buildSocial(initial))) out.socialLinks = Object.keys(social).length ? social : null
  const was = [...(g.services ?? [])].sort().join()
  if ([...services].sort().join() !== was) out.services = SERVICES.filter((s) => services.has(s))
  if (v.networkRole !== initial.networkRole) out.networkRole = v.networkRole
  if (v.lettersSentBefore.trim() !== initial.lettersSentBefore.trim()) out.lettersSentBefore = Number(v.lettersSentBefore.trim() || 0)
  return out
}
