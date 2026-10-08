import type { ApiError, GroupBlock, UserRole } from '../types'
import { commonRefusal, otherRefusal } from './refusals'

// Shared by the group admin's block actions (components/group/WriterBlockActions)
// and the Blocked writers page: README "Blocking a writer" (Groups) and
// "Recommending a site-wide block" (Moderation). Refusals are worded from the
// status, the error's name and its condition, never from the API's sentence.

/** POST /chapter/block: `reason` is required and at most 500 characters. */
export const BLOCK_REASON_MAX = 500
/** POST /moderation/ban-recommendation: `reason` is required and at most 1000 characters. */
export const RECOMMEND_REASON_MAX = 1000

/** The writer as the thread (or a list) knows them: enough to decide whether a group may block them. */
export interface BlockableWriter {
  id: number
  name: string | null
  penName?: string | null
  /** Last resort for naming them: the thread's writer has no pen name in it, and a writer may have no name. */
  username?: string
  role: UserRole
  managedBy: number | null
  anonymousForChapter: number | null
  claimedAt?: string | null
}

/**
 * Whether a group admin of group `chapterId` gets the block and recommend
 * actions for this writer. Only a writer (`role: user`) can be blocked or
 * recommended; a writer the group looks after itself, and an anonymous writer,
 * aren't someone to block: the group writes those letters.
 */
export function canActOn(writer: BlockableWriter, chapterId: number | null): boolean {
  if (chapterId === null) return false
  if (writer.role !== 'user') return false
  if (writer.anonymousForChapter !== null) return false
  // A writer who claimed their account is their own now, whoever made it.
  if (writer.managedBy === chapterId && !writer.claimedAt) return false
  return true
}

/** One person on a block or a recommendation: `you`, their name, or their username. */
export function personLabel(person: { id: number; username: string; name: string | null } | null, me: number | undefined): string {
  if (!person) return 'someone no longer here'
  if (person.id === me) return 'you'
  return person.name || person.username
}

export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

/** The group's block of this writer, if it has one. */
export const blockOf = (blocks: GroupBlock[] | null, writerId: number) => blocks?.find((b) => b.writer?.id === writerId) ?? null

/** "1 letter", "3 letters". */
export const letterCount = (n: number) => `${n} ${n === 1 ? 'letter' : 'letters'}`

export type BlockAction = 'block' | 'unblock' | 'recommend'

/** What to say when the API refuses a block, an unblock or a recommendation; the shared cases from utils/refusals. */
export function blockRefusal(error: ApiError, action: BlockAction): string {
  if (action === 'recommend' && error.name === 'BanRecommendationError' && error.condition === 'pending')
    return 'Your group already has one waiting for this writer. A site admin will decide it, and the outcome shows on Blocked writers.'
  if (error.status === 404)
    return action === 'unblock'
      ? 'This writer isn’t blocked by your group any more: another group admin may have unblocked them already.'
      : 'This writer’s account is no longer here.'
  if (error.status === 400)
    return action === 'recommend'
      ? `This account can’t be recommended: only a writer can, and not one already blocked from the whole site. The reason can be at most ${RECOMMEND_REASON_MAX} characters.`
      : `This account can’t be blocked: only a writer can. The reason can be at most ${BLOCK_REASON_MAX} characters.`
  return commonRefusal(error) ?? otherRefusal(error)
}
