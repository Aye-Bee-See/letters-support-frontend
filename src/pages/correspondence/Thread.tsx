import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMyBlocks } from '../../api/auth'
import { getFacility } from '../../api/facilities'
import { getAttachments, getChat } from '../../api/letters'
import { getUnreadNotifications, markNotificationsRead } from '../../api/notifications'
import CorrectReply from '../../components/forms/CorrectReply'
import QueuedLetterActions from '../../components/forms/QueuedLetterActions'
import RecordReplyPanel from '../../components/forms/RecordReplyPanel'
import ReplyPanel from '../../components/forms/ReplyPanel'
import WriterBlockActions from '../../components/group/WriterBlockActions'
import LoadState from '../../components/ui/LoadState'
import { useApi, type ApiState } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { announceUnreadCount } from '../../hooks/useUnreadCount'
import { forgetReplacedKeys, openAttachment, openLetter, type LetterReader, type OpenedLetter } from '../../letters/open'
import type { Attachment, Chat, Message, Prison, Prisoner, WriterBlock } from '../../types'
import { addressLine } from '../../utils/facilities'
import { declineReasonForWriter, heldReasonText, isGroupAnonymous, returnReasonText, writerInSentence, writerLabel } from '../../utils/groupLetters'
import { oldKeyText, threadPrisonerName } from '../../utils/letters'
import { displayName } from '../../utils/prisoners'

// Markup and classes from solidarity-site/thread.html (pages/thread.css). At
// the bottom, a writer's reply panel, or for a group admin the panel that
// records the prisoner's reply (WP5); the sidebar holds the group's block
// actions (WP4b). Every letter is opened
// when the page loads (collapsed rows show a preview); attachments are fetched
// and decrypted only when a letter is expanded.

/**
 * A letter being written again, its text to start from: a returned or declined
 * one (`resend`, sent with resendOf), or a held one just deleted to send again
 * (`rewrite`, a new letter).
 */
interface Resend {
  id: number
  date: string
  text: string
  kind: 'resend' | 'rewrite'
}

interface OpenedMessage {
  message: Message
  opened: OpenedLetter
}

/** The same letter, unchanged since it was opened: its body, relay note and update time. */
// Not `updatedAt`: a status move bumps it, and the body and content key are the same.
const unchanged = (a: Message, b: Message) =>
  a.id === b.id && a.ciphertext === b.ciphertext && a.nonce === b.nonce && a.relayNoteCiphertext === b.relayNoteCiphertext

/**
 * The thread with every letter opened, oldest first; marks this thread's
 * notifications read. On a reload, a letter opened last time and unchanged
 * since keeps what was opened (its content key too, so an expanded letter's
 * files aren't fetched again); the rest are opened afresh.
 */
async function loadThread(id: number, reader: LetterReader, previous: OpenedMessage[] | null) {
  const chat = await getChat(id, true)
  const messages = [...(chat.messages ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const before = new Map((previous ?? []).filter((l) => l.opened.state === 'open').map((l) => [l.message.id, l]))
  const letters: OpenedMessage[] = await Promise.all(
    messages.map(async (message) => {
      const kept = before.get(message.id)
      return { message, opened: kept && unchanged(kept.message, message) ? kept.opened : await openLetter(message, reader) }
    }),
  )
  // Opening the thread reads it, and the header's count drops. Failure here must not break the page.
  getUnreadNotifications()
    .then((items) => items.filter((n) => n.chat === id).map((n) => n.id))
    .then((ids) => (ids.length ? markNotificationsRead(ids) : null))
    .then((result) => result && announceUnreadCount(result.unread))
    .catch(() => null)
  return { chat, letters }
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const NO_BLOCKS: WriterBlock[] = []

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** The status pill: its text and one of thread.css's three styles. */
function statusOf(m: Message): { text: string; className: string; short: string } {
  const group = m.relay_group?.name
  switch (m.status) {
    case 'queued':
      // A held letter isn't on its way: say so, whatever the reason (including ones this client doesn't know yet).
      if (m.heldReason) return { short: 'On hold', className: 'status-pending', text: group ? `On hold · ${group}` : 'On hold' }
      return { short: 'Waiting', className: 'status-pending', text: group ? `Waiting to print · ${group}` : 'Waiting to print' }
    case 'printed':
      return { short: 'Printed', className: 'status-pending', text: group ? `Printed by ${group}` : 'Printed' }
    case 'mailed':
      return { short: 'Mailed', className: 'status-mailed', text: group ? `Mailed by ${group}` : 'Mailed' }
    case 'returned':
      return { short: 'Returned', className: 'status-pending', text: 'Returned' }
    case 'received':
      return { short: 'Received', className: 'status-received', text: 'Received' }
    case 'declined':
      return { short: 'Not sent', className: 'status-pending', text: group ? `Not sent · ${group}` : 'Not sent' }
  }
}

/** A declined letter: the reason, the rule it would break (as it read when declined), and the group's note. */
function DeclinedNote({ m }: { m: Message }) {
  const label = m.declineRuleLabel ?? null
  const group = m.relay_group?.name ?? 'The group'
  const reason = declineReasonForWriter(m.declineReason)
  return (
    <p className="letter-body-scan-note" style={{ marginBottom: '0.75rem' }}>
      {group} didn’t send this letter, because {reason}
      {label ? `: “${label}”` : ''}.{m.declineNote ? ` They wrote: “${m.declineNote}”` : ''}
    </p>
  )
}

/**
 * Why a queued letter is held. A group admin (`chapterId`, their group) reads
 * the group's wording (utils/groupLetters); `writer_blocked` says "your group"
 * only when the letter is this group's to mail, and links to Blocked writers.
 */
function groupHeldText(m: Message, chapterId: number | null): ReactNode {
  const ours = m.relayChapter !== null && m.relayChapter === chapterId
  const text = heldReasonText(m.heldReason, { ours, name: m.relay_group?.name ?? null })
  if (!text) return null
  // Unblocking is on Blocked writers or in the sidebar (README "Blocking a writer").
  if (m.heldReason === 'writer_blocked' && ours)
    return (
      <>
        {text}. <Link to="/blocked-writers">Blocked writers</Link>
      </>
    )
  return `${text}.`
}

/** Why a queued letter is held, as its writer reads it, with what they can do about it below. */
function heldText(m: Message, prisonerName: string, blocks: Map<number, WriterBlock>, canChoose: boolean): ReactNode {
  switch (m.heldReason) {
    case 'choose_relay':
      // The picker below needs the prisoner's facility; out of the directory, there is none to choose from.
      return canChoose
        ? `${prisonerName} has been moved. This letter is waiting until you choose which group mails it now: choose below.`
        : `${prisonerName} has been moved, and isn’t in the directory at the moment, so no group can be chosen for this letter. You can delete it.`
    case 'reseal_needed':
      return `${prisonerName} has been moved, and the group that was going to mail this letter doesn’t serve their new facility. To send it, delete it and write it again.`
    case 'prisoner_free':
      return `${prisonerName} has been released. The group will decide whether this letter can still be sent, or you can delete it.`
    case 'writer_blocked': {
      const group = m.relay_group?.name ?? 'The group that mails this letter'
      // The reason they gave, from GET /auth/blocks (API #179); the notification may be long read.
      const block = m.relayChapter !== null ? blocks.get(m.relayChapter) : undefined
      return block
        ? `${group} has stopped mailing your letters, so this one won’t be printed. Their reason: “${block.reason}”`
        : `${group} has stopped mailing your letters, so this one won’t be printed.`
    }
    default:
      // A reason this client doesn't know yet: still held, never "on its way".
      return m.heldReason ? 'This letter is on hold and won’t be printed for now.' : null
  }
}

function previewOf(m: Message, opened: OpenedLetter): string {
  if (opened.state === 'waiting') return 'Waiting to be shared with you'
  if (opened.state === 'unreadable') return 'This letter could not be opened'
  if (opened.state === 'old-key') return oldKeyText(opened.sealedWith, opened.holding).short
  if (opened.text) return opened.text.replace(/\s+/g, ' ').slice(0, 90) + (opened.text.length > 90 ? '…' : '')
  if (m.paper) return 'Written on paper'
  return m.sender === 'prisoner' ? 'Scan' : 'Letter'
}

/** Attachments of an opened letter, fetched and decrypted when it is expanded. */
function LetterAttachments({ message, contentKey }: { message: Message; contentKey: Uint8Array }) {
  const [files, setFiles] = useState<{ attachment: Attachment; url: string | null; error?: string }[] | null>(null)

  useEffect(() => {
    let current = true
    // Revoked when the letter is collapsed. A file still decrypting then gets
    // no URL at all: one made after this cleanup ran would never be revoked.
    const urls: string[] = []
    getAttachments(message.id)
      .then((rows) =>
        Promise.all(
          rows.map(async (attachment) => {
            try {
              if (!current) return { attachment, url: null }
              const blob = await openAttachment(attachment, contentKey)
              if (!current) return { attachment, url: null }
              const url = URL.createObjectURL(blob)
              urls.push(url)
              return { attachment, url }
            } catch {
              return { attachment, url: null, error: 'This file could not be opened.' }
            }
          }),
        ),
      )
      .then((result) => current && setFiles(result))
      .catch(() => current && setFiles([]))
    return () => {
      current = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [message.id, contentKey])

  if (!files) return <div className="letter-body-scan"><span className="letter-body-scan-note">Opening attachments…</span></div>
  return (
    <>
      {files.map(({ attachment, url, error }) => (
        <div key={attachment.id} className="letter-body-scan">
          <span className="letter-body-scan-icon">📄</span>
          <span className="letter-body-scan-name">
            {attachment.originalName ?? 'Attachment'} · {(attachment.size / 1024 / 1024).toFixed(1)} MB
          </span>
          {error && <span className="letter-body-scan-note">{error}</span>}
          {url && attachment.mimeType.startsWith('image/') && (
            <img src={url} alt={attachment.originalName ?? 'Scan'} style={{ maxWidth: '100%', marginTop: '0.5rem' }} />
          )}
          {url && !attachment.mimeType.startsWith('image/') && (
            <a className="letter-body-scan-note" href={url} target="_blank" rel="noopener noreferrer" download={attachment.originalName ?? undefined}>
              Open
            </a>
          )}
        </div>
      ))}
    </>
  )
}

function LetterItem({
  item,
  initiallyOpen,
  prisonerName,
  writerName,
  blocks,
  forGroup,
  onWriteAgain,
  onCorrected,
  queued,
}: {
  item: OpenedMessage
  initiallyOpen: boolean
  prisonerName: string
  writerName: string
  blocks: Map<number, WriterBlock>
  /** The reader is a group admin of this group; null for the writer. */
  forGroup: { chapterId: number | null } | null
  /** Offered on the writer's own returned and declined letters, when a reply can be sent. */
  onWriteAgain?: (resend: Resend) => void
  /** Group admins, on a reply their group may correct: Edit transcription and Delete, then this. */
  onCorrected?: () => void
  /** The writer, on their own queued letter: Delete, and choosing its group for a choose_relay hold (from `facility`'s relay groups). */
  queued?: {
    prisonId: number | null
    facility: ApiState<Prison | null>
    onRewrite?: (rewrite: Resend) => void
    mayReplaceReply: () => boolean
    onChanged: () => void
  }
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const { message: m, opened } = item
  const outbound = m.sender === 'user'
  const status = statusOf(m)
  const held = forGroup ? groupHeldText(m, forGroup.chapterId) : heldText(m, prisonerName, blocks, queued?.prisonId != null)

  return (
    <div className={`letter-item ${outbound ? 'outbound' : 'inbound'}${open ? ' is-open' : ''}`}>
      <div
        className="letter-collapsed"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          // A button answers Space as well as Enter; Space would otherwise scroll the page.
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
      >
        <span className="letter-collapsed-direction">{outbound ? '→' : '←'}</span>
        <span className="letter-collapsed-date">{shortDate(m.createdAt)}</span>
        <span className="letter-collapsed-preview">{previewOf(m, opened)}</span>
        <span className={`letter-collapsed-status ${status.className}`}>{status.short}</span>
        <span className="letter-collapsed-chevron">▾</span>
      </div>

      {open && (
        <div className="letter-expanded">
          <div className="letter-expanded-header">
            <span className="letter-expanded-direction">{outbound ? '→ Sent to prisoner' : '← Received from prisoner'}</span>
            <span className="letter-expanded-date">{longDate(m.createdAt)}</span>
            <span className="letter-expanded-writer">
              {outbound ? writerName : m.relay_group ? `Recorded by ${m.relay_group.name}` : ''}
            </span>
            <span className={`letter-expanded-status ${status.className}`}>{status.text}</span>
          </div>

          {held && <p className="letter-body-scan-note" style={{ marginBottom: '0.75rem' }}>{held}</p>}
          {queued && outbound && m.status === 'queued' && (
            <QueuedLetterActions
              message={m}
              prisonerName={prisonerName}
              prisonId={queued.prisonId}
              facility={queued.facility}
              blocks={blocks}
              onRewrite={
                queued.onRewrite && opened.state === 'open'
                  ? () => queued.onRewrite?.({ id: m.id, date: m.createdAt, text: opened.text ?? '', kind: 'rewrite' })
                  : undefined
              }
              mayReplaceReply={queued.mayReplaceReply}
              // Edit needs the content key (the writer's own envelope opened) and a typed body.
              editable={
                opened.state === 'open' && opened.text !== null && !m.paper
                  ? { text: opened.text, relayNote: opened.relayNote, contentKey: opened.contentKey }
                  : undefined
              }
              onChanged={queued.onChanged}
            />
          )}
          {m.status === 'returned' && (
            <p className="letter-body-scan-note" style={{ marginBottom: '0.75rem' }}>
              This letter came back: {lowerFirst(returnReasonText(m.returnReason))}.{m.returnNote ? ` The envelope said: “${m.returnNote}”.` : ''}
            </p>
          )}
          {m.status === 'declined' && <DeclinedNote m={m} />}
          {outbound && (m.status === 'returned' || m.status === 'declined') && onWriteAgain && (
            <p style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => onWriteAgain({ id: m.id, date: m.createdAt, text: opened.state === 'open' ? (opened.text ?? '') : '', kind: 'resend' })}
              >
                Write it again
              </button>
            </p>
          )}

          {opened.state === 'waiting' && (
            <div className="letter-body-scan">
              <span className="letter-body-scan-note">Your group will share this letter with you shortly.</span>
            </div>
          )}
          {opened.state === 'unreadable' && (
            <div className="letter-body-scan">
              <span className="letter-body-scan-note">This letter could not be opened.</span>
            </div>
          )}
          {opened.state === 'old-key' && (
            <div className="letter-body-scan">
              <span className="letter-body-scan-note">{oldKeyText(opened.sealedWith, opened.holding).long}</span>
            </div>
          )}
          {opened.state === 'open' && (
            <>
              {opened.text && <div className="letter-body-text">{opened.text}</div>}
              {!opened.text && m.paper && (
                <div className="letter-body-scan">
                  <span className="letter-body-scan-note">Written on paper and handed to {m.relay_group?.name ?? 'the group'} to mail.</span>
                </div>
              )}
              {opened.relayNote && (
                <p className="letter-body-scan-note" style={{ marginTop: '0.75rem' }}>
                  Note to {m.relay_group?.name ?? 'the group'}: {opened.relayNote}
                </p>
              )}
              <LetterAttachments message={m} contentKey={opened.contentKey} />
            </>
          )}
          {onCorrected && (
            <CorrectReply
              message={m}
              text={opened.state === 'open' ? (opened.text ?? '') : ''}
              contentKey={opened.state === 'open' ? opened.contentKey : null}
              onChanged={onCorrected}
            />
          )}
        </div>
      )}
    </div>
  )
}

function Sidebar({
  chat,
  letters,
  showWriter,
  chapterId,
  blockNotice,
  onBlockChanged,
}: {
  chat: Chat
  letters: OpenedMessage[]
  showWriter: boolean
  /** The reading group admin's group. */
  chapterId: number | null
  /** What the last block or unblock did, kept across the reload that follows it. */
  blockNotice: string | null
  /** After the group blocks or unblocks the writer: their held letters changed. */
  onBlockChanged: (notice: string) => void
}) {
  const prisoner = chat.prisoner_details as Prisoner | null | undefined
  const prison = prisoner?.prison_details as Prison | null | undefined
  const address = prison ? addressLine(prison.address) : null
  const lastRelay = [...letters].reverse().find((l) => l.message.sender === 'user' && l.message.relay_group)?.message.relay_group
  const sent = letters.filter((l) => l.message.sender === 'user').length

  return (
    <aside className="thread-sidebar">
      <div className="thread-sidebar-section">
        <div className="thread-sidebar-heading">Prisoner</div>
        <div className="thread-sidebar-info">
          <strong>{threadPrisonerName(chat)}</strong>
          {prison && (
            <>
              <br />
              {prison.prisonName}
            </>
          )}
        </div>
        {address && <div className="thread-sidebar-address">{address}</div>}
      </div>

      {showWriter && chat.user_details && (
        <>
          <hr className="thread-sidebar-divider" />
          <div className="thread-sidebar-section">
            <div className="thread-sidebar-heading">Writer</div>
            <div className="thread-sidebar-info">
              <strong>{writerLabel(chat.user_details)}</strong>
              {chat.user_details.managedBy && !chat.user_details.claimedAt && (
                <>
                  <br />
                  {/* No name for another group: the thread carries only its id. */}
                  {chat.user_details.managedBy === chapterId ? 'Managed by your group' : 'Managed by another group'}
                </>
              )}
            </div>
            {/* Block from our group, recommend a site-wide block (WP4b); nothing for a writer the group looks after. */}
            <WriterBlockActions writer={chat.user_details} initialNotice={blockNotice} onChanged={onBlockChanged} />
          </div>
        </>
      )}

      {lastRelay && (
        <>
          <hr className="thread-sidebar-divider" />
          <div className="thread-sidebar-section">
            <div className="thread-sidebar-heading">Mailed by</div>
            <div className="thread-sidebar-info">
              <Link to={`/groups/${lastRelay.id}`}>
                <strong>{lastRelay.name}</strong>
              </Link>
            </div>
          </div>
        </>
      )}

      {prisoner?.interests && prisoner.interests.length > 0 && (
        <>
          <hr className="thread-sidebar-divider" />
          <div className="thread-sidebar-section">
            <div className="thread-sidebar-heading">Interests</div>
            <div className="thread-sidebar-tags">
              {prisoner.interests.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <hr className="thread-sidebar-divider" />
      <div className="thread-sidebar-section">
        <div className="thread-sidebar-heading">Letters</div>
        <div className="thread-sidebar-info">
          {letters.length} total &nbsp;·&nbsp; {sent} sent &nbsp;·&nbsp; {letters.length - sent} received
        </div>
      </div>
    </aside>
  )
}

export default function Thread() {
  const id = Number(useParams().id)
  const { user, keypair, groupKeypair, keys, isChapter } = useAuth()
  // The letters as last opened, so a reload opens only what changed.
  const opened = useRef<OpenedMessage[] | null>(null)
  const page = useApi(
    () =>
      loadThread(
        id,
        { userId: user!.id, keypair: keypair!, chapterId: user!.chapterId, groupKeypair, groupKeyVersion: keys?.orgKey?.keyVersion ?? null },
        opened.current,
      ),
    [id, user?.id],
    // After a reply, a block or a correction the thread stays on screen while it loads again.
    { keepPrevious: true },
  )
  // The prisoner's facility with its relay groups (full=true), for the writer's
  // reply panel and a held letter's group picker: fetched once here for both.
  const prisonId = !isChapter ? ((page.data?.chat.prisoner_details as Pick<Prisoner, 'prison'> | null | undefined)?.prison ?? null) : null
  const facilityState = useApi<Prison | null>(() => (prisonId !== null ? getFacility(prisonId, true) : Promise.resolve(null)), [prisonId])
  // A returned or declined letter being written again in the reply panel below.
  const [resend, setResend] = useState<Resend | null>(null)
  // A block or unblock from the sidebar holds or releases this writer's letters,
  // so the thread loads again; the sidebar's notice is kept across that reload.
  const [blockNotice, setBlockNotice] = useState<string | null>(null)
  // Whether the writer's reply panel holds a draft, so "Write it again" asks before replacing it.
  const replyHasContent = useRef(false)
  const onReplyDraftChange = useCallback((hasContent: boolean) => {
    replyHasContent.current = hasContent
  }, [])
  // Groups not mailing this writer's letters, and why (empty for anyone else).
  // A writer's own only (README "GET /auth/blocks"): a group admin's would always be empty.
  const blocksState = useApi(() => (isChapter ? Promise.resolve(NO_BLOCKS) : getMyBlocks()), [isChapter])
  const blocks = new Map((blocksState.data ?? []).map((b) => [b.chapter.id, b]))
  useEffect(() => {
    // Content keys a reload replaced are wiped; ones it kept (unchanged letters) stay in use.
    forgetReplacedKeys(opened.current, page.data?.letters)
    opened.current = page.data?.letters ?? null
  }, [page.data])
  // And every one still held when the page goes.
  useEffect(() => () => forgetReplacedKeys(opened.current), [])

  if (!page.data) {
    return (
      <div className="app-wrap">
        <title>Conversation · letters.support</title>
        <div className="wrap">
          <LoadState state={page} what="conversation" />
        </div>
      </div>
    )
  }

  const { chat, letters } = page.data
  const prisoner = chat.prisoner_details
  const prisonerName = threadPrisonerName(chat)
  const facility = (prisoner?.prison_details as Prison | null | undefined)?.prisonName
  // A group admin knows the writer by their pen name, as the letters are signed
  // (README "GET /chat/chats": `user_details.penName`), else their name, else their username.
  const writerName = chat.user === user?.id ? (user.penName ?? user.username) : writerLabel(chat.user_details)
  const lastRelayId = [...letters].reverse().find((l) => l.message.sender === 'user' && l.message.relay_group)?.message.relay_group?.id
  // A group admin may correct or delete a reply their group recorded, or any
  // reply in the thread of a writer it manages (README "PUT /messaging/message").
  const managedHere = chat.user_details?.managedBy != null && chat.user_details.managedBy === user?.chapterId && !chat.user_details.claimedAt
  /** Replacing the reply panel's draft loses what is typed there: ask first. */
  const mayReplaceReply = () => !replyHasContent.current || window.confirm('Discard the reply you’re writing, and start again from this letter?')
  /** Start the reply panel from a letter's text (the panel is below the letters). */
  const startFrom = (r: Resend) => {
    setResend(r)
    window.setTimeout(() => document.querySelector('.reply-panel')?.scrollIntoView({ behavior: 'smooth' }), 0)
  }
  const writeAgain = (r: Resend) => {
    if (mayReplaceReply()) startFrom(r)
  }
  const canCorrect = (m: Message) =>
    isChapter && m.sender === 'prisoner' && m.status === 'received' && (managedHere || (m.relayChapter !== null && m.relayChapter === user?.chapterId))

  return (
    <div className="app-wrap">
      <title>{`Letters with ${prisonerName} · letters.support`}</title>
      <div className="app-layout">
        <main className="thread-main">
          <div className="thread-header">
            <Link to="/inbox" className="thread-back">
              ← Back to inbox
            </Link>
            <h1 className="thread-title">
              {prisoner ? <Link to={`/prisoners/${prisoner.id}`}>{displayName(prisoner)}</Link> : prisonerName}
            </h1>
            <div className="thread-meta">
              {facility && <span>{facility}</span>}
              {/* Group admins see whose thread this is; a writer knows. */}
              {isChapter && (
                <>
                  {facility && <span>·</span>}
                  <span>
                    Writer: <span className="thread-meta-writer">{writerName}</span>
                  </span>
                </>
              )}
            </div>
            {page.reloading && (
              <p className="thread-updating" role="status">
                Updating…
              </p>
            )}
            {/* A reload that failed: what was on screen stays (useApi keepPrevious), with the reason. */}
            {page.error && (
              <p className="thread-updating" role="alert">
                Couldn’t update the conversation ({page.error.message}).{' '}
                <button type="button" className="btn btn-sm" onClick={page.reload}>
                  Try again
                </button>
              </p>
            )}
          </div>

          <div className="letter-chain">
            {letters.length === 0 && <p className="convo-empty">No letters in this conversation yet.</p>}
            {letters.map((item, i) => (
              <LetterItem
                key={item.message.id}
                item={item}
                initiallyOpen={i === letters.length - 1}
                prisonerName={prisonerName}
                writerName={writerName}
                blocks={blocks}
                forGroup={isChapter ? { chapterId: user?.chapterId ?? null } : null}
                onWriteAgain={!isChapter && prisoner?.prison ? writeAgain : undefined}
                onCorrected={canCorrect(item.message) ? page.reload : undefined}
                queued={
                  !isChapter && chat.user === user?.id
                    ? { prisonId: prisoner?.prison ?? null, facility: facilityState, onRewrite: prisoner?.prison ? startFrom : undefined, mayReplaceReply, onChanged: page.reload }
                    : undefined
                }
              />
            ))}
          </div>
          {/* The writer's reply; for a group admin, recording the prisoner's reply
              (README "Reply reference": filing a reply), the writer and prisoner fixed. */}
          {isChapter && prisoner && (
            <RecordReplyPanel
              writer={{
                id: chat.user,
                name: writerInSentence(chat.user_details),
                publicKey: chat.user_details?.publicKey,
                anonymous: chat.user_details ? isGroupAnonymous(chat.user_details) : false,
              }}
              prisoner={{ id: prisoner.id, name: prisonerName }}
              onRecorded={() => page.reload()}
            />
          )}
          {!isChapter && prisoner?.prison && (
            // Keyed on the letter being written again, so the draft starts from its text.
            <ReplyPanel
              key={resend?.id ?? 'reply'}
              prisonerId={prisoner.id}
              facility={facilityState}
              preferredGroup={lastRelayId}
              resend={resend ?? undefined}
              onCancelResend={() => setResend(null)}
              onDraftChange={onReplyDraftChange}
              onSent={() => {
                setResend(null)
                page.reload()
              }}
            />
          )}
          {!prisoner && (
            <p className="convo-empty">
              This person is not in the directory at the moment, so replies can't be {isChapter ? 'recorded' : 'sent'} from here.
            </p>
          )}
        </main>

        <Sidebar
          chat={chat}
          letters={letters}
          showWriter={isChapter}
          chapterId={user?.chapterId ?? null}
          blockNotice={blockNotice}
          onBlockChanged={(notice) => {
            setBlockNotice(notice)
            page.reload()
          }}
        />
      </div>
    </div>
  )
}
