import type { AccountBrief } from '../types'

// A record's history in words (README "The history of one record"): each kind
// of entry, and who made it. Shared by the admin edit pages' history and the
// group settings page's (components/admin/RecordHistory.tsx).

/** Each kind of entry in words; an action not listed shows as the API names it. */
export const HISTORY_ACTIONS: Record<string, string> = {
  'prisoner.create': 'Record created',
  'prisoner.update': 'Record edited',
  'prisoner.delete': 'Record deleted',
  'prisoner.photo': 'Photo added or replaced',
  'prisoner.photo.remove': 'Photo taken down',
  'prisoner.support.add': 'Support group linked',
  'prisoner.support.remove': 'Support group unlinked',
  'prison.create': 'Record created',
  'prison.update': 'Record edited',
  'prison.delete': 'Record deleted',
  'prison.relay.add': 'Relay group linked',
  'prison.relay.remove': 'Relay group unlinked',
  'chapter.create': 'Group created',
  'chapter.update': 'Record edited',
  'chapter.delete': 'Group deleted',
  'chapter.keys': 'Group key set up',
  'chapter.keys.rotate': 'Group key rotated',
  'chapter.member-key': 'Group key handed to a group admin',
  'chapter.member-key.remove': 'A group admin stopped being handed the group key',
  'chapter.owner': 'Group-owner admin changed',
  'chapter.two-factor': 'Two-factor sign-in requirement changed',
  'chapter.block': 'Writer blocked',
  'chapter.block.remove': 'Writer unblocked',
  'invite-code.issue': 'Invite codes issued',
  'invite-code.cancel': 'Invite codes cancelled',
  'invite-code.join': 'An invite code was used',
}

/**
 * An entry's action in words. A `prisoner.photo` entry says whether it
 * replaced an earlier photo (`replaced: true|false` since API #215; older
 * entries hold the old file's name there instead, which is never shown).
 */
export function historyAction(action: string, details?: Record<string, unknown> | null): string {
  const replaced = details?.replaced
  if (action === 'prisoner.photo' && typeof replaced === 'boolean') return replaced ? 'Photo replaced' : 'Photo added'
  if (action === 'prisoner.photo' && typeof replaced === 'string' && replaced) return 'Photo replaced'
  return HISTORY_ACTIONS[action] ?? action
}

const ROLE_WORDS: Record<AccountBrief['role'], string> = { admin: 'a site admin', chapter: 'a group admin', user: 'a writer', banned: 'a banned account' }

/** Someone named on a record: an entry's actor, or who made a block or a recommendation (no role given there). */
export type Actor = Pick<AccountBrief, 'id' | 'username' | 'name'> & { role?: AccountBrief['role'] }

/**
 * Who did something: "you" for the signed-in account, else their name (a site
 * admin's marked so), else their role. Lower case, to go mid-sentence. `gone`
 * is what a null says: on a history entry, the site itself or an account since
 * deleted; on a block or a recommendation, utils/blocks.ts's NO_LONGER_HERE.
 */
export function actorName(actor: Actor | null, me: number | undefined, gone = 'the site itself, or an account since deleted'): string {
  if (!actor) return gone
  if (actor.id === me) return 'you'
  const name = actor.name || actor.username
  if (!name) return actor.role ? ROLE_WORDS[actor.role] : name
  return actor.role === 'admin' ? `${name} (site admin)` : name
}

// --- The people an entry's details name ------------------------------------------
//
// Some entries of a group's history record account ids in their details (who
// was handed the key, who the ownership went to, which writer was blocked): API
// keys.controller.js and chapter.controller.js. Shown as bare numbers they say
// nothing (issue #68), so the pages look the accounts up and name them here,
// the way the actor is named.

/** Which details of which entries hold account ids; `members` is a list of them. */
const ACCOUNT_DETAILS: Record<string, readonly string[]> = {
  'chapter.keys': ['firstMember', 'owner'],
  'chapter.member-key': ['member'],
  'chapter.member-key.remove': ['member'],
  'chapter.owner': ['from', 'to'],
  'chapter.keys.rotate': ['members'],
  'chapter.block': ['writer'],
  'chapter.block.remove': ['writer'],
}

/** A detail's key in the site's words, where the API's own key isn't one. */
const DETAIL_LABELS: Record<string, Record<string, string>> = {
  'chapter.keys': { firstMember: 'First key holder', owner: 'Group-owner admin' },
  'chapter.member-key': { member: 'Group admin' },
  'chapter.member-key.remove': { member: 'Group admin' },
  'chapter.owner': { from: 'From', to: 'To', by: 'Changed by' },
  'chapter.keys.rotate': { members: 'Key holders' },
  'chapter.block': { writer: 'Writer' },
  'chapter.block.remove': { writer: 'Writer' },
}

/** Who moved a group's ownership (`by` on `chapter.owner`), in words. */
const OWNER_CHANGED_BY: Record<string, string> = { owner: 'the group-owner admin', superadmin: 'a site admin' }

/** Does this detail of this kind of entry hold an account id, or a list of them? */
export const isAccountDetail = (action: string, key: string) => ACCOUNT_DETAILS[action]?.includes(key) ?? false

/** A detail's label in the site's words, or null to fall back on the key itself. */
export const detailLabel = (action: string, key: string): string | null => DETAIL_LABELS[action]?.[key] ?? null

/** A detail whose value is a word of the API's, in the site's words; null for any other. */
export function detailWord(action: string, key: string, value: unknown): string | null {
  if (action === 'chapter.owner' && key === 'by' && typeof value === 'string') return OWNER_CHANGED_BY[value] ?? null
  return null
}

const accountIds = (value: unknown): number[] =>
  (Array.isArray(value) ? value : [value]).filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0)

/** The account ids one detail holds: one, several (`members`), or none (ownership passing from nobody). */
export const detailAccounts = (action: string, key: string, value: unknown): number[] => (isAccountDetail(action, key) ? accountIds(value) : [])

/** Every account id the entries' details name, once each, in order of appearance. */
export function detailAccountIds(entries: { action: string; details?: Record<string, unknown> | null }[]): number[] {
  const ids = new Set<number>()
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry.details ?? {})) for (const id of detailAccounts(entry.action, key, value)) ids.add(id)
  }
  return [...ids]
}

/**
 * The accounts a page found for those ids. A null is an account that is gone
 * (deleted since); an id not in the map couldn't be looked up.
 */
export type NamedAccounts = ReadonlyMap<number, Actor | null>

/** The accounts the entries themselves name: every actor, which costs no request. */
export function actorsOf(entries: { actor: Actor | null }[]): Map<number, Actor> {
  const known = new Map<number, Actor>()
  for (const { actor } of entries) if (actor) known.set(actor.id, actor)
  return known
}

/**
 * One account a detail names, as actorName says an actor: "you", a name, a
 * role. `unknown` is what to say of an id the page couldn't look up.
 */
export function accountName(id: number, accounts: NamedAccounts, me: number | undefined, unknown = `account #${id}`): string {
  if (id === me) return 'you'
  const account = accounts.get(id)
  if (account === undefined) return unknown
  return actorName(account, me, 'an account since deleted')
}
