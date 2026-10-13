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

const ROLE_WORDS: Record<AccountBrief['role'], string> = { admin: 'a site admin', chapter: 'a group admin', user: 'a writer', banned: 'a banned account' }

/**
 * Who made an entry: "you" for the signed-in account, else their name (a site
 * admin's marked so), else their role. Lower case, to go mid-sentence.
 */
export function actorName(actor: AccountBrief | null, me: number | undefined): string {
  if (!actor) return 'the site itself, or an account since deleted'
  if (actor.id === me) return 'you'
  const name = actor.name || actor.username
  if (!name) return ROLE_WORDS[actor.role]
  return actor.role === 'admin' ? `${name} (site admin)` : name
}
