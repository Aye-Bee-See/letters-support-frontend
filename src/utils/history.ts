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
type Actor = Pick<AccountBrief, 'id' | 'username' | 'name'> & { role?: AccountBrief['role'] }

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
