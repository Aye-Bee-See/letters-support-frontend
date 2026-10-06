import { useEffect, useMemo, useRef, useState } from 'react'
import { getMyBlocks } from '../api/auth'
import { useApi } from './useApi'
import { useAuth } from './useAuth'
import { forgetContentKey } from '../crypto'
import { AttachmentNotUploaded, draftHasContent, newIdempotencyKey, sendLetter, uploadLetterFile, type LetterDraft, type Sender } from '../letters/send'
import { toApiError } from '../api/client'
import type { Chapter, Message, Prison, WriterBlock } from '../types'

/**
 * For a group admin: whom the letter is written as (README "Message fields",
 * `user`). One of the group's managed writers, with their public key (null
 * while they have none), or the group's anonymous writer.
 */
export type WriteAs = { kind: 'writer'; id: number; publicKey: string | null } | { kind: 'anonymous' }

const NO_BLOCKS: WriterBlock[] = []

/** The prototype's page estimate (new-letter.html updateCount). */
const CHARS_PER_PAGE = 2800

/** What to tell the writer about a failed request. */
function describe(err: unknown): string {
  const e = toApiError(err)
  return e.errors.length ? e.errors.join(' ') : e.status ? e.message : err instanceof Error ? err.message : 'Something went wrong.'
}

/** A letter that went without its file: what retrying the file needs. The content key stays in memory only. */
interface FileToRetry {
  letter: Message
  file: File
  contentKey: Uint8Array
  idempotencyKey: string
}

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
  /** A group admin's letter: the writer it is written as; nothing can be sent until one is chosen. Ignored for writers. */
  writeAs?: WriteAs | null,
) {
  const { user, keypair, groupKeypair } = useAuth()
  const isGroup = user?.role === 'chapter'
  const groupId = isGroup ? user.chapterId : null
  /** Who the letter goes out as: the signed-in writer, or a group admin writing for one of the group's writers. */
  const sender: Sender | null = !user
    ? null
    : isGroup
      ? groupId !== null && groupKeypair && writeAs
        ? { groupId, groupKeypair, writer: writeAs.kind === 'writer' ? { id: writeAs.id, publicKey: writeAs.publicKey } : null }
        : null
      : keypair
        ? { userId: user.id, keypair }
        : null
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
  // Sent, but the file didn't upload: the letter, the file's name, and why (see AttachmentNotUploaded).
  const retryRef = useRef<FileToRetry | null>(null)
  const [attachmentFailed, setAttachmentFailed] = useState<{ letter: Message; fileName: string; error: string } | null>(null)
  // The key must be forgotten exactly once, and never while a retry is using it:
  // on leaving the page (unless a retry is under way, which then forgets it), and
  // for a failure that only arrives after the page has gone.
  const mountedRef = useRef(false)
  const retryingRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (retryRef.current && !retryingRef.current) {
        void forgetContentKey(retryRef.current.contentKey)
        retryRef.current = null
      }
    }
  }, [])

  /** Groups that print and mail for this facility, active ones only. */
  const groups: Chapter[] = useMemo(() => (facility?.relay_groups ?? []).filter((g) => g.accountStatus === 'active'), [facility])
  /**
   * Groups not mailing this writer's letters (API #179), by group id, with the
   * reason they gave. A writer's own only: a block is about the writer sending,
   * and a group may still write for a writer it looks after (README "Blocking a writer").
   */
  const blocksState = useApi(() => (isGroup ? Promise.resolve(NO_BLOCKS) : getMyBlocks()), [isGroup])
  const blocked = useMemo(() => new Map<number, WriterBlock>((blocksState.data ?? []).map((b) => [b.chapter.id, b])), [blocksState.data])
  // The chosen group, else the thread's own (for a group, itself), else the first; never one that has blocked this writer.
  const open = groups.filter((g) => !blocked.has(g.id))
  const relayChapterId =
    open.find((g) => g.id === chosenGroup)?.id ??
    open.find((g) => g.id === (preferredGroup ?? groupId))?.id ??
    open[0]?.id ??
    null
  /** Every group that mails to this facility has blocked this writer. */
  const allBlocked = groups.length > 0 && open.length === 0

  const pages = Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE))
  const overPageLimit = !paper && facility?.pageLimit != null && pages > facility.pageLimit
  const canSend = Boolean(prisonerId && relayChapterId && sender && draftHasContent({ text, paper, file })) && !sending && !attachmentFailed

  async function send(): Promise<Message | null> {
    if (!canSend || !prisonerId || !relayChapterId || !sender) return null
    setSending(true)
    setError(null)
    const draft: LetterDraft = { prisonerId, relayChapterId, text, relayNote, paper, file, idempotencyKey, resendOf }
    try {
      const message = await sendLetter(draft, sender)
      clearDraft()
      return message
    } catch (err) {
      if (err instanceof AttachmentNotUploaded && !mountedRef.current) {
        // The page has gone: nobody is left to retry, so don't keep the key.
        await forgetContentKey(err.contentKey)
        return null
      }
      if (err instanceof AttachmentNotUploaded && file) {
        // The letter is sent: the draft is spent, and only the file is left to retry.
        retryRef.current = { letter: err.letter, file, contentKey: err.contentKey, idempotencyKey }
        setAttachmentFailed({ letter: err.letter, fileName: file.name, error: describe(err.cause) })
        clearDraft()
        return null
      }
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
      setError(describe(err))
      return null
    } finally {
      setSending(false)
    }
  }

  function clearDraft() {
    setText('')
    setRelayNote('')
    setPaper(false)
    setFile(null)
    setResendOf(null)
    setIdempotencyKey(newIdempotencyKey())
  }

  /** Done with a letter whose file failed: forget its key; returns the letter. */
  function finishAttachment(): Message | null {
    const pending = retryRef.current
    if (!pending) return null
    retryRef.current = null
    void forgetContentKey(pending.contentKey)
    setAttachmentFailed(null)
    return pending.letter
  }

  /** Upload the file again, with the letter's own key. Returns the letter once it's there (null if the page has gone). */
  async function retryAttachment(): Promise<Message | null> {
    const pending = retryRef.current
    if (!pending || sending || retryingRef.current) return null
    retryingRef.current = true
    setSending(true)
    try {
      await uploadLetterFile(pending.letter, pending.file, pending.contentKey, pending.idempotencyKey)
      const letter = finishAttachment()
      // Done after the page has gone: the writer is elsewhere now, so nothing to go on to.
      return mountedRef.current ? letter : null
    } catch (err) {
      setAttachmentFailed({ letter: pending.letter, fileName: pending.file.name, error: describe(err) })
      return null
    } finally {
      retryingRef.current = false
      setSending(false)
      // The page went while the retry was under way: its cleanup left the key to this.
      if (!mountedRef.current) finishAttachment()
    }
  }

  /** Go on without the file; the letter stays sent. Returns the letter. */
  const skipAttachment = () => finishAttachment()

  return {
    text, setText, relayNote, setRelayNote, paper, setPaper, file, setFile,
    groups, blocked, allBlocked, relayChapterId, setChosenGroup, resendOf,
    pages, overPageLimit, canSend, sending, error, send,
    /** A group admin holds the group key in this session (needed to write for the group's writers). */
    hasGroupKey: Boolean(groupKeypair),
    attachmentFailed, retryAttachment, skipAttachment,
  }
}
