import { useMemo, useState } from 'react'
import { useAuth } from './useAuth'
import { draftHasContent, newIdempotencyKey, sendLetter, type LetterDraft } from '../letters/send'
import { toApiError } from '../api/client'
import type { Chapter, Message, Prison } from '../types'

/** The prototype's page estimate (new-letter.html updateCount). */
const CHARS_PER_PAGE = 2800

/**
 * A letter being written to one prisoner at one facility: the state shared by
 * New Letter and the thread's reply panel, and the send.
 */
export function useLetterDraft(prisonerId: number | null, facility: Prison | null, preferredGroup?: number) {
  const { user, keypair } = useAuth()
  const [text, setText] = useState('')
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
  const relayChapterId =
    groups.find((g) => g.id === chosenGroup)?.id ?? groups.find((g) => g.id === preferredGroup)?.id ?? groups[0]?.id ?? null

  const pages = Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE))
  const overPageLimit = !paper && facility?.pageLimit != null && pages > facility.pageLimit
  const canSend = Boolean(prisonerId && relayChapterId && user && keypair && draftHasContent({ text, paper, file })) && !sending

  async function send(): Promise<Message | null> {
    if (!canSend || !prisonerId || !relayChapterId || !user || !keypair) return null
    setSending(true)
    setError(null)
    const draft: LetterDraft = { prisonerId, relayChapterId, text, relayNote, paper, file, idempotencyKey }
    try {
      const message = await sendLetter(draft, { userId: user.id, keypair })
      setText('')
      setRelayNote('')
      setPaper(false)
      setFile(null)
      setIdempotencyKey(newIdempotencyKey())
      return message
    } catch (err) {
      const e = toApiError(err)
      setError(e.errors.length ? e.errors.join(' ') : e.status ? e.message : err instanceof Error ? err.message : 'The letter could not be sent.')
      return null
    } finally {
      setSending(false)
    }
  }

  return {
    text, setText, relayNote, setRelayNote, paper, setPaper, file, setFile,
    groups, relayChapterId, setChosenGroup,
    pages, overPageLimit, canSend, sending, error, send,
  }
}
