import type { Chat, HeldReason, LetterStatus, Sender } from '../types'
import { displayName } from './prisoners'

// Display helpers for threads and letters (no decryption here).

/** The last letter's direction and state, as the inbox shows it: "→ mailed", "← received". */
export function directionLabel(sender: Sender, status: LetterStatus): { inbound: boolean; text: string } {
  if (sender === 'prisoner') return { inbound: true, text: 'received' }
  const words: Record<LetterStatus, string> = {
    queued: 'waiting to print',
    printed: 'printed',
    mailed: 'mailed',
    received: 'received',
    returned: 'returned',
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
