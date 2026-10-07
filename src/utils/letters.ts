import type { Chat, HeldReason, LetterStatus, Sender } from '../types'
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
