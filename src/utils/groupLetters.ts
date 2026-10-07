import type { ApiError, DeclineReason, HeldReason, LetterFooter, LetterStatus, MailRule, Message, Prison, ReturnReason } from '../types'

// Wording for the group inbox and the one-letter print page (group-admin-plan.md,
// WP1). The API sends codes; these are the group admin's words for them. Nothing
// here is worded from an error's sentence (plan section 3); the letter ids a
// refusal names come from its `ids`, read from the sentence only for an older API.

// --- The print queue's filters (README "GET /messaging/messages") ---------------

export type QueueFilter = 'queued' | 'held' | 'printed' | 'mailed' | 'returned' | 'declined'

/** The six filters, in the order a letter goes through them, with the list parameters each sends. */
export const QUEUE_FILTERS: { key: QueueFilter; label: string; status: LetterStatus; held?: boolean }[] = [
  { key: 'queued', label: 'Queued', status: 'queued', held: false },
  { key: 'held', label: 'Held', status: 'queued', held: true },
  { key: 'printed', label: 'Printed', status: 'printed' },
  { key: 'mailed', label: 'Mailed', status: 'mailed' },
  { key: 'returned', label: 'Returned', status: 'returned' },
  { key: 'declined', label: 'Not sent', status: 'declined' },
]

export const queueFilter = (key: string | null): (typeof QUEUE_FILTERS)[number] =>
  QUEUE_FILTERS.find((f) => f.key === key) ?? QUEUE_FILTERS[0]

/** What the queue says when a filter has nothing in it. */
export const EMPTY_QUEUE: Record<QueueFilter, string> = {
  queued: 'Nothing waiting to be printed.',
  held: 'No letters are on hold.',
  printed: 'No printed letters waiting to be mailed.',
  mailed: 'No mailed letters yet.',
  returned: 'No letters have come back.',
  declined: 'Your group hasn’t declined any letters.',
}

// --- Held letters (README "Moved and freed") ------------------------------------

/** Why a queued letter is held, as the group admin reads it. */
const HELD_REASONS: Record<HeldReason, string> = {
  choose_relay: 'On hold: the prisoner was moved and the writer has to choose which group mails it now',
  reseal_needed: 'On hold: the prisoner was moved and the writer has to send it again for the group that serves the new facility',
  prisoner_free: 'On hold: the prisoner has been released, so it may never reach them',
  writer_blocked: 'On hold: your group blocked this writer',
}

/** A held letter's reason in words; a reason this client doesn't know yet is still "on hold". */
export const heldReasonText = (reason: string | null | undefined): string | null =>
  reason ? (HELD_REASONS[reason as HeldReason] ?? 'On hold') : null

/**
 * What the print page asks before printing a held letter, naming the hold:
 * "This letter is on hold: the prisoner has been released, so it may never reach
 * them. Print it anyway?" Null for a letter that isn't held.
 */
export function heldPrintQuestion(reason: string | null | undefined): string | null {
  const text = heldReasonText(reason)
  if (!text) return null
  const why = text.replace(/^On hold:?\s*/, '')
  return why ? `This letter is on hold: ${why}. Print it anyway?` : 'This letter is on hold. Print it anyway?'
}

/** The short form, for a row's badge. */
const HELD_SHORT: Record<HeldReason, string> = {
  choose_relay: 'Held: writer must choose a group',
  reseal_needed: 'Held: writer must send it again',
  prisoner_free: 'Held: prisoner released',
  writer_blocked: 'Held: writer blocked',
}

export const heldReasonShort = (reason: string | null | undefined): string | null =>
  reason ? (HELD_SHORT[reason as HeldReason] ?? 'Held') : null

// --- Returns and declines (README "Letter lifecycle": "Returned mail", "Declined letters") ---

/** The six return reasons, as the "It came back" form offers them. */
export const RETURN_REASONS: { value: ReturnReason; label: string }[] = [
  { value: 'refused', label: 'Refused by the mail room, no rule named' },
  { value: 'rule_violation', label: 'It broke one of the facility’s mail rules' },
  { value: 'transferred', label: 'The person has been moved' },
  { value: 'released', label: 'The person has been released' },
  { value: 'bad_address', label: 'Undeliverable as addressed' },
  { value: 'unknown', label: 'It came back and nothing says why' },
]

export const returnReasonText = (reason: string | null | undefined) =>
  RETURN_REASONS.find((r) => r.value === reason)?.label ?? 'It came back'

/** The three decline reasons, as the "Don't send" form offers them. */
export const DECLINE_REASONS: { value: DeclineReason; label: string }[] = [
  { value: 'facility_rule', label: 'It would break one of the facility’s mail rules' },
  { value: 'content', label: 'It is inappropriate or unsafe to send' },
  { value: 'other', label: 'Something else (say what in the note)' },
]

/** A declined letter's reason in words, with the rule's label as it read when it was declined (API #184). */
export function declineText(m: Pick<Message, 'declineReason' | 'declineRuleLabel'>): string {
  const reason = DECLINE_REASONS.find((r) => r.value === m.declineReason)?.label ?? 'Not sent'
  return m.declineReason === 'facility_rule' && m.declineRuleLabel ? `${reason}: “${m.declineRuleLabel}”` : reason
}

/**
 * The mail rules a batch decline may name, from the queue's full=true rows. The
 * API checks the rule against each letter's own facility (`400 not_eligible`,
 * README "Declined letters"), so rules are offered only when every selected
 * letter is at one facility; otherwise `why` says why `facility_rule` isn't.
 */
export function batchDeclineRules(letters: Pick<Message, 'prisoner_details'>[]): { rules: MailRule[]; why: string } {
  const facilities = new Set(letters.map((m) => m.prisoner_details?.prison ?? null))
  if (facilities.has(null)) return { rules: [], why: 'a selected letter has no facility listed' }
  if (facilities.size > 1) return { rules: [], why: 'the selected letters are at different facilities: select letters to one facility to name its rule' }
  const prison = (letters[0]?.prisoner_details?.prison_details ?? null) as Prison | null
  const rules = (prison?.mail_rule_details ?? []).filter((r) => !r.retired)
  return { rules, why: 'this facility lists no mail rules' }
}

/** Return and decline notes: at most 200 characters, shown to the writer, never encrypted. */
export const NOTE_LIMIT = 200

// --- The printed footer (README "Reply reference") ------------------------------

/**
 * The sentence printed under the letter, from `footer`:
 * "Write back to James Hollow, c/o PDX ABC. Reference 4827-1935-8: please write
 * this number at the top of your reply." The group's anonymous writer has no
 * name, so the footer names the group only. Where the facility refuses
 * reference numbers (`reference` null) it says the name and c/o only. Never a
 * QR code or barcode: this goes inside a prison.
 */
export function footerSentence(footer: LetterFooter): string {
  const group = footer.careOf?.name ?? null
  let to: string
  if (footer.anonymous || !footer.name) to = group ?? 'the group that mailed this letter'
  else to = group ? `${footer.name}, c/o ${group}` : footer.name
  const write = `Write back to ${to}.`
  return footer.reference ? `${write} Reference ${footer.reference}: please write this number at the top of your reply.` : write
}

// --- Who wrote it ---------------------------------------------------------------

/** The writer as the group knows them: the pen name, else the name; "Anonymous" for the group's anonymous writer. */
export function writerLabel(writer: { name?: string | null; penName?: string | null; username?: string | null; anonymousForChapter?: number | null } | null | undefined): string {
  if (!writer) return 'Unknown writer'
  if (writer.anonymousForChapter) return 'Anonymous'
  return writer.penName || writer.name || writer.username || 'Unknown writer'
}

// --- Batch refusals (README "PUT /messaging/status/batch") ------------------------

/**
 * Which of the letters asked for a refusal names. All or none: when one letter
 * can't move, none did. The API names the letters in `ids` (API #196), or, for
 * a `facility_rule` decline naming a rule a facility lacks, in
 * `problems[0].params.ids`. An older API named them only in its sentence
 * ("Letter 42: …", "letter 41, 42", "Message 41, 42 not found"), so the
 * sentence is read only when neither field is there. Only the ids that were
 * asked for count.
 */
export function lettersNamed(error: Pick<ApiError, 'message' | 'ids' | 'problems'>, ids: number[]): number[] {
  const fromParams = error.problems?.[0]?.params?.ids
  const given = error.ids ?? (Array.isArray(fromParams) ? fromParams.filter((id): id is number => typeof id === 'number') : null)
  const named = new Set(given ?? (error.message.match(/\d+/g) ?? []).map(Number))
  return ids.filter((id) => named.has(id))
}

/** True when the refusal named its letters in a field, as the API has since #196. */
const namesInField = (error: Pick<ApiError, 'ids' | 'problems'>) => Array.isArray(error.ids) || Array.isArray(error.problems?.[0]?.params?.ids)

const letterList = (ids: number[]) =>
  ids.length === 1 ? `Letter ${ids[0]}` : `Letters ${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`

/**
 * Why a batch (or one letter) couldn't be marked, worded from the status, `name`
 * and `condition` (README "PUT /messaging/status/batch", "Error codes"):
 * `letter_status.not_allowed`, `letter_held.<heldReason>`,
 * `authorization.not_yours`, `not_found` and `changed_meanwhile`. Nothing was changed.
 */
export function statusRefusal(error: ApiError, ids: number[], target: LetterStatus): string {
  const named = lettersNamed(error, ids)
  const who = named.length ? letterList(named) : ids.length === 1 ? 'This letter' : 'One of the letters'
  const plural = named.length > 1
  const is = plural ? 'are' : 'is'
  const nothing = ids.length > 1 ? ' Nothing was marked: the letters move all together or not at all.' : ''
  if (error.status === 0) return 'Couldn’t reach the server. Nothing was marked; try again.'
  if (error.status === 409 && error.name === 'LetterHeldError') {
    // The condition is the hold itself (README "Moved and freed"); one this client doesn't know is still a hold.
    const why = (heldReasonText(error.condition) ?? '').replace(/^On hold:?\s*/, '')
    const hold = why ? `${who} ${is} on hold: ${why}.` : `${who} ${is} on hold.`
    return `${hold} Printing a held letter has to be confirmed: print it from the Held list, or from the letter’s own page.${nothing}`
  }
  if (error.status === 409 && error.condition === 'changed_meanwhile')
    return `${who} ${plural ? 'were' : 'was'} changed by someone else meanwhile.${nothing} Reload and try again.`
  // `letter_status.not_allowed`, and any other 409: the letter is not where the move starts from.
  if (error.status === 409)
    return `${who} can’t be marked ${target} from where ${plural ? 'they are' : 'it is'} now; someone may have moved ${plural ? 'them' : 'it'} already.${nothing} Reload to see where things stand.`
  // `authorization.not_yours`; an older API sent no condition, but named the letters in its sentence.
  if (error.status === 403 && (error.condition === 'not_yours' || (!namesInField(error) && !error.condition && named.length > 0)))
    return `${who} ${plural ? 'aren’t' : 'isn’t'} your group’s to mark: ${plural ? 'they are' : 'it is'} mailed by another group now.${nothing}`
  if (error.status === 403) return `Your group can’t change letters right now: it may be waiting for approval or suspended.${nothing}`
  if (error.status === 404)
    return `${who} ${is} gone: the writer may have deleted ${plural ? 'them' : 'it'}.${nothing} Reload the list.`
  // A `facility_rule` decline naming a rule some letter's facility lacks: `not_eligible` on `rule`, naming the letters.
  if (error.status === 400 && error.problems?.[0]?.field === 'rule' && error.problems[0].code === 'not_eligible')
    return `${named.length ? `The facility of ${who.toLowerCase()}` : 'A selected letter’s facility'} doesn’t list that rule (any more).${nothing} Reload and pick again, or decline for another reason.`
  if (error.status === 400) return `The server refused this change.${nothing}`
  return `Something went wrong on the server (${error.status}).${nothing} Try again later.`
}

// --- Sharing with a partner group (README "Sending and reading letters") --------

export type ShareOutcome = { kind: 'done' | 'error'; text: string }

/**
 * What POST /messaging/envelope's refusal means for a share. `retry` for a
 * first 409 KeyVersionError (the partner rotated its key while it was being
 * sealed: fetch the key again and seal once more); a second one says so. A 409
 * EnvelopeError means the partner holds an envelope already. Matched on the
 * error's name, never on the status alone.
 */
export function shareRefusal(error: ApiError, partner: string, retried: boolean): ShareOutcome | 'retry' {
  if (error.status === 409 && error.name === 'KeyVersionError')
    return retried ? { kind: 'error', text: `${partner} changed its key again while this was being shared. Try once more.` } : 'retry'
  if (error.status === 409 && error.name === 'EnvelopeError') return { kind: 'done', text: `${partner} can already read this letter.` }
  if (error.status === 400) return { kind: 'error', text: `${partner} can’t be given this letter: it may no longer relay for this facility.` }
  if (error.status === 403) return { kind: 'error', text: 'Only a group that can read this letter can share it.' }
  if (error.status === 0) return { kind: 'error', text: 'Couldn’t reach the server. Try again.' }
  return { kind: 'error', text: `Couldn’t share the letter (${error.status}). Try again later.` }
}
