import type { ApiError, Chat, HeldReason, LetterStatus, Sender } from '../types'
import { displayName } from './prisoners'

// Display helpers for threads and letters (no decryption here).

/**
 * The last letter's direction and state, as the inbox shows it: "→ mailed", "← received".
 * A held letter (last_message.heldReason, API #178) is "on hold", never "waiting to print".
 */
export function directionLabel(sender: Sender, status: LetterStatus, heldReason?: HeldReason | null): { inbound: boolean; text: string } {
  if (sender === 'prisoner') return { inbound: true, text: 'received' }
  if (status === 'queued' && heldReason) return { inbound: false, text: 'on hold' }
  const words: Record<LetterStatus, string> = {
    queued: 'waiting to print',
    printed: 'printed',
    mailed: 'mailed',
    received: 'received',
    returned: 'returned',
    declined: 'not sent',
  }
  return { inbound: false, text: words[status] }
}

/** Held letters that wait on the writer (not on the group). */
const WRITER_HELD: HeldReason[] = ['choose_relay', 'reseal_needed']
export const needsWriter = (chat: Pick<Chat, 'heldReasons'>) => chat.heldReasons.some((r) => WRITER_HELD.includes(r))

/** The prisoner's name on a thread, or a stand-in when the record is not published. */
export function threadPrisonerName(chat: Chat): string {
  return chat.prisoner_details ? displayName(chat.prisoner_details) : 'Prisoner not in the directory'
}

/** "Aug 9, 2026", as the prototype's inbox dates. */
export const inboxDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

/**
 * A group's envelope that would not open because it names another group key
 * version than this session holds (README "Sending and reading letters": every
 * envelope carries `keyVersion` on reads, API #198). Older: sealed under a key
 * the group has since rotated away, which the current key cannot open. Newer:
 * the group rotated under this session, which picks the new key up on the
 * Group key page or by signing in again.
 */
export function oldKeyText(sealedWith: number, holding: number): { short: string; long: string } {
  if (sealedWith < holding)
    return {
      short: 'Sealed under an older group key',
      long: `This letter was sealed under an older group key (version ${sealedWith}; your group’s key is now version ${holding}), so the current key can’t open it.`,
    }
  return {
    short: 'Sealed under a newer group key',
    long: `This letter was sealed under a newer group key (version ${sealedWith}) than this session holds (version ${holding}). Open the Group key page, or sign in again, to pick up the new key.`,
  }
}

// --- The writer's own queued letter (README "Letter lifecycle", "Moved and freed") ---
// While a letter is queued its writer may delete it, and for a `choose_relay`
// hold choose the group that mails it (PUT /messaging/message { relayChapter }).

/**
 * What Delete asks first, by the letter's hold. `rewrite`: its text then goes
 * into the reply box to be sent again (a `reseal_needed` hold, when it can be).
 */
export function deleteQuestion(heldReason: HeldReason | null, prisonerName: string, rewrite = false): string {
  if (rewrite)
    return `Delete this letter and write it again? Its text goes into the reply box below, to send through a group that serves ${prisonerName}’s facility now.`
  if (heldReason === 'prisoner_free')
    return `Delete this letter? ${prisonerName} has been released, so it may never reach them. It won’t be printed, and it can’t be brought back.`
  return 'Delete this letter? It won’t be printed or mailed, and it can’t be brought back.'
}

/**
 * Why deleting a queued letter, or choosing its group, was refused, worded from
 * the status, `name` and the 400's field and code (never the API's sentence).
 * Nothing was changed. `group`: the chosen group's name.
 */
export function queuedLetterRefusal(error: ApiError, action: 'delete' | 'choose', group?: string): string {
  const problem = error.problems?.[0]
  if (error.status === 0) return 'Couldn’t reach the server. Nothing was changed; try again.'
  if (error.status === 403 && error.name === 'GroupBlockError')
    return `${group ?? 'That group'} isn’t mailing your letters, so it can’t take this one. Choose another group, or delete the letter.`
  // Printed (or mailed) meanwhile: from then on only a site admin can change it.
  if (error.status === 403)
    return `This letter can’t be ${action === 'delete' ? 'deleted' : 'changed'} any more: the group may have printed it meanwhile. Reload to see where it is.`
  if (error.status === 404) return 'This letter is gone already. Reload the conversation.'
  // End-to-end mode: the letter is sealed for the readers its group implies, and the server can't re-seal it.
  if (error.status === 400 && problem?.field === 'relayChapter' && problem.code === 'not_settable_here')
    return 'This letter is sealed for the group that was going to mail it, so it can’t be handed to another one. Delete it and write it again.'
  if (error.status === 400 && problem?.field === 'relayChapter') return `${group ?? 'That group'} doesn’t mail to this facility any more. Reload and choose again.`
  if (error.status === 400) return error.errors[0] ?? 'The server refused this change.'
  return `Something went wrong on the server (${error.status}). Try again later.`
}
