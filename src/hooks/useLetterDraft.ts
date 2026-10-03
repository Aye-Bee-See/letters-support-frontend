import { useMemo, useState } from 'react'
import { getMyBlocks } from '../api/auth'
import { useApi } from './useApi'
import { useAuth } from './useAuth'
import { draftHasContent, newIdempotencyKey, sendLetter, type LetterDraft } from '../letters/send'
import { toApiError } from '../api/client'
import type { Chapter, Message, Prison, WriterBlock } from '../types'

/** The prototype's page estimate (new-letter.html updateCount). */
const CHARS_PER_PAGE = 2800

/**
 * A letter being written to one prisoner at one facility: the state shared by
 * New Letter and the thread's reply panel, and the send.
 */
export function useLetterDraft(
  prisonerId: number | null,
  facility: Prison | null,
  preferredGroup?: number,
  /** Writing a returned or declined letter again: its text, and its id to send as resendOf. */
  initial?: { text: string; resendOf: number },
) {
  const { user, keypair } = useAuth()
  const [text, setText] = useState(initial?.text ?? '')
  const [resendOf, setResendOf] = useState<number | null>(initial?.resendOf ?? null)
  const [relayNote, setRelayNote] = useState('')
  const [paper, setPaper] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [chosenGroup, setChosenGroup] = useState<number | null>(null)
  // One key per letter, kept across retries; a new one after a letter is sent.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Groups that print and mail for this facility, active ones only. */
  const groups: Chapter[] = useMemo(() => (facility?.relay_groups ?? []).filter((g) => g.accountStatus === 'active'), [facility])
  /** Groups not mailing this writer's letters (API #179), by group id, with the reason they gave. */
  const blocksState = useApi(getMyBlocks, [])
  const blocked = useMemo(() => new Map<number, WriterBlock>((blocksState.data ?? []).map((b) => [b.chapter.id, b])), [blocksState.data])
  // The chosen group, else the thread's own, else the first; never one that has blocked this writer.
  const open = groups.filter((g) => !blocked.has(g.id))
  const relayChapterId =
    open.find((g) => g.id === chosenGroup)?.id ?? open.find((g) => g.id === preferredGroup)?.id ?? open[0]?.id ?? null
  /** Every group that mails to this facility has blocked this writer. */
  const allBlocked = groups.length > 0 && open.length === 0

  const pages = Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE))
  const overPageLimit = !paper && facility?.pageLimit != null && pages > facility.pageLimit
  const canSend = Boolean(prisonerId && relayChapterId && user && keypair && draftHasContent({ text, paper, file })) && !sending

  async function send(): Promise<Message | null> {
    if (!canSend || !prisonerId || !relayChapterId || !user || !keypair) return null
    setSending(true)
    setError(null)
    const draft: LetterDraft = { prisonerId, relayChapterId, text, relayNote, paper, file, idempotencyKey, resendOf }
    try {
      const message = await sendLetter(draft, { userId: user.id, keypair })
      setText('')
      setRelayNote('')
      setPaper(false)
      setFile(null)
      setResendOf(null)
      setIdempotencyKey(newIdempotencyKey())
      return message
    } catch (err) {
      const e = toApiError(err)
      if (e.name === 'GroupBlockError') {
        // The group that would mail it has blocked this writer (API #171); other groups are unaffected.
        const blocked = groups.find((g) => g.id === relayChapterId)?.name ?? 'This group'
        const others = groups.filter((g) => g.id !== relayChapterId)
        setError(
          `${blocked} isn’t mailing your letters any more, so it can’t take this one.` +
            (others.length ? ' Choose another group that mails to this facility, and send it again.' : ' No other group mails to this facility yet.'),
        )
        return null
      }
      setError(e.errors.length ? e.errors.join(' ') : e.status ? e.message : err instanceof Error ? err.message : 'The letter could not be sent.')
      return null
    } finally {
      setSending(false)
    }
  }

  return {
    text, setText, relayNote, setRelayNote, paper, setPaper, file, setFile,
    groups, blocked, allBlocked, relayChapterId, setChosenGroup, resendOf,
    pages, overPageLimit, canSend, sending, error, send,
  }
}
