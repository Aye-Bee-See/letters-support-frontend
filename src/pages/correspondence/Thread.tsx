import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMyBlocks } from '../../api/auth'
import { getAttachments, getChat } from '../../api/letters'
import { getUnreadNotifications, markNotificationsRead } from '../../api/notifications'
import CorrectReply from '../../components/forms/CorrectReply'
import RecordReplyPanel from '../../components/forms/RecordReplyPanel'
import ReplyPanel from '../../components/forms/ReplyPanel'
import WriterBlockActions from '../../components/group/WriterBlockActions'
import LoadState from '../../components/ui/LoadState'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { openAttachment, openLetter, type LetterReader, type OpenedLetter } from '../../letters/open'
import type { Attachment, Chat, DeclineReason, Message, Prison, Prisoner, WriterBlock } from '../../types'
import { addressLine } from '../../utils/facilities'
import { writerLabel } from '../../utils/groupLetters'
import { oldKeyText, threadPrisonerName } from '../../utils/letters'
import { displayName } from '../../utils/prisoners'

// Markup and classes from solidarity-site/thread.html (pages/thread.css). At
// the bottom, a writer's reply panel, or for a group admin the panel that
// records the prisoner's reply (WP5); the sidebar holds the group's block
// actions (WP4b). Every letter is opened
// when the page loads (collapsed rows show a preview); attachments are fetched
// and decrypted only when a letter is expanded.

/** A returned or declined letter being written again: sent with resendOf, its text to start from. */
interface Resend {
  id: number
  date: string
  text: string
}

interface OpenedMessage {
  message: Message
  opened: OpenedLetter
}

/** The thread with every letter opened, oldest first; marks this thread's notifications read. */
async function loadThread(id: number, reader: LetterReader) {
  const chat = await getChat(id, true)
  const messages = [...(chat.messages ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const letters: OpenedMessage[] = await Promise.all(messages.map(async (message) => ({ message, opened: await openLetter(message, reader) })))
  // Opening the thread reads it. Failure here must not break the page.
  getUnreadNotifications()
    .then((items) => items.filter((n) => n.chat === id).map((n) => n.id))
    .then((ids) => (ids.length ? markNotificationsRead(ids) : null))
    .catch(() => null)
  return { chat, letters }
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const RETURN_REASONS: Record<string, string> = {
  refused: 'refused by the mail room',
  rule_violation: 'it broke one of the facility’s mail rules',
  transferred: 'the person has been moved',
  released: 'the person has been released',
  bad_address: 'undeliverable as addressed',
  unknown: 'no reason given',
}

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

/** Why the group didn't send it, as the writer reads it (API #170: three codes, worded here). */
const DECLINE_REASONS: Record<DeclineReason, string> = {
  facility_rule: 'it would break one of the facility’s mail rules',
  content: 'it was judged inappropriate or unsafe to send',
  other: 'of something else',
}

/** A declined letter: the reason, the rule it would break (as it read when declined), and the group's note. */
function DeclinedNote({ m }: { m: Message }) {
  const label = m.declineRuleLabel ?? null
  const group = m.relay_group?.name ?? 'The group'
  const reason = DECLINE_REASONS[m.declineReason ?? 'other'] ?? DECLINE_REASONS.other
  return (
    <p className="letter-body-scan-note" style={{ marginBottom: '0.75rem' }}>
      {group} didn’t send this letter, because {reason}
      {label ? `: “${label}”` : ''}.{m.declineNote ? ` They wrote: “${m.declineNote}”` : ''}
    </p>
  )
}

/** Why a queued letter is held, for its writer (or, for `writer_blocked`, for the group admins who blocked them). */
function heldText(m: Message, prisonerName: string, blocks: Map<number, WriterBlock>, forGroup: boolean): ReactNode {
  switch (m.heldReason) {
    case 'choose_relay':
      return `${prisonerName} has been moved. This letter is waiting until you choose which group mails it now.`
    case 'reseal_needed':
      return `${prisonerName} has been moved. This letter is waiting to be shared with the group that now serves their facility.`
    case 'prisoner_free':
      return `${prisonerName} has been released. The group will decide whether this letter can still be sent.`
    case 'writer_blocked': {
      // A group admin reads this in the thread of a writer their group blocked
      // (README "Blocking a writer"); unblocking is on Blocked writers or in the sidebar.
      if (forGroup)
        return (
          <>
            Held: your group blocked this writer. <Link to="/blocked-writers">Blocked writers</Link>
          </>
        )
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
    const urls: string[] = []
    getAttachments(message.id)
      .then((rows) =>
        Promise.all(
          rows.map(async (attachment) => {
            try {
              const url = URL.createObjectURL(await openAttachment(attachment, contentKey))
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
}: {
  item: OpenedMessage
  initiallyOpen: boolean
  prisonerName: string
  writerName: string
  blocks: Map<number, WriterBlock>
  /** The reader is a group admin. */
  forGroup: boolean
  /** Offered on the writer's own returned and declined letters, when a reply can be sent. */
  onWriteAgain?: (resend: Resend) => void
  /** Group admins, on a reply their group may correct: Edit transcription and Delete, then this. */
  onCorrected?: () => void
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const { message: m, opened } = item
  const outbound = m.sender === 'user'
  const status = statusOf(m)
  const held = heldText(m, prisonerName, blocks, forGroup)

  return (
    <div className={`letter-item ${outbound ? 'outbound' : 'inbound'}${open ? ' is-open' : ''}`}>
      <div className="letter-collapsed" onClick={() => setOpen((o) => !o)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}>
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
          {m.status === 'returned' && (
            <p className="letter-body-scan-note" style={{ marginBottom: '0.75rem' }}>
              This letter came back: {RETURN_REASONS[m.returnReason ?? 'unknown']}.{m.returnNote ? ` The envelope said: “${m.returnNote}”.` : ''}
            </p>
          )}
          {m.status === 'declined' && <DeclinedNote m={m} />}
          {outbound && (m.status === 'returned' || m.status === 'declined') && onWriteAgain && (
            <p style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => onWriteAgain({ id: m.id, date: m.createdAt, text: opened.state === 'open' ? (opened.text ?? '') : '' })}
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
  blockNotice,
  onBlockChanged,
}: {
  chat: Chat
  letters: OpenedMessage[]
  showWriter: boolean
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
                  Managed by your group
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
  const page = useApi(
    () => loadThread(id, { userId: user!.id, keypair: keypair!, chapterId: user!.chapterId, groupKeypair, groupKeyVersion: keys?.orgKey?.keyVersion ?? null }),
    [id, user?.id],
  )
  // A returned or declined letter being written again in the reply panel below.
  const [resend, setResend] = useState<Resend | null>(null)
  // A block or unblock from the sidebar holds or releases this writer's letters,
  // so the thread loads again; the sidebar's notice is kept across that reload.
  const [blockNotice, setBlockNotice] = useState<string | null>(null)
  // Groups not mailing this writer's letters, and why (empty for anyone else).
  const blocksState = useApi(getMyBlocks, [])
  const blocks = new Map((blocksState.data ?? []).map((b) => [b.chapter.id, b]))

  if (!page.data) {
    return (
      <div className="app-wrap">
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
  const writerName = chat.user === user?.id ? (user.penName ?? user.username) : chat.user_details ? writerLabel(chat.user_details) : 'Writer'
  const lastRelayId = [...letters].reverse().find((l) => l.message.sender === 'user' && l.message.relay_group)?.message.relay_group?.id
  // A group admin may correct or delete a reply their group recorded, or any
  // reply in the thread of a writer it manages (README "PUT /messaging/message").
  const managedHere = chat.user_details?.managedBy != null && chat.user_details.managedBy === user?.chapterId && !chat.user_details.claimedAt
  const canCorrect = (m: Message) =>
    isChapter && m.sender === 'prisoner' && m.status === 'received' && (managedHere || (m.relayChapter !== null && m.relayChapter === user?.chapterId))

  return (
    <div className="app-wrap">
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
                forGroup={isChapter}
                onWriteAgain={
                  !isChapter && prisoner?.prison
                    ? (r) => {
                        setResend(r)
                        // The reply panel is below the letters.
                        window.setTimeout(() => document.querySelector('.reply-panel')?.scrollIntoView({ behavior: 'smooth' }), 0)
                      }
                    : undefined
                }
                onCorrected={canCorrect(item.message) ? page.reload : undefined}
              />
            ))}
          </div>
          {/* The writer's reply; for a group admin, recording the prisoner's reply
              (README "Reply reference": filing a reply), the writer and prisoner fixed. */}
          {isChapter && prisoner && (
            <RecordReplyPanel
              writer={{ id: chat.user, name: writerName, publicKey: chat.user_details?.publicKey }}
              prisoner={{ id: prisoner.id, name: prisonerName }}
              onRecorded={() => page.reload()}
            />
          )}
          {!isChapter && prisoner?.prison && (
            // Keyed on the letter being written again, so the draft starts from its text.
            <ReplyPanel
              key={resend?.id ?? 'reply'}
              prisonerId={prisoner.id}
              prisonId={prisoner.prison}
              preferredGroup={lastRelayId}
              resend={resend ?? undefined}
              onCancelResend={() => setResend(null)}
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
