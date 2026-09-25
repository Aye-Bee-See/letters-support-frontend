import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAttachments, getChat } from '../../api/letters'
import { getUnreadNotifications, markNotificationsRead } from '../../api/notifications'
import LoadState from '../../components/ui/LoadState'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { openAttachment, openLetter, type LetterReader, type OpenedLetter } from '../../letters/open'
import type { Attachment, Chat, Message, Prison, Prisoner } from '../../types'
import { addressLine } from '../../utils/facilities'
import { threadPrisonerName } from '../../utils/letters'
import { displayName } from '../../utils/prisoners'

// Markup and classes from solidarity-site/thread.html (pages/thread.css). The
// reply panel is built with New Letter (Step 5, next). Every letter is opened
// when the page loads (collapsed rows show a preview); attachments are fetched
// and decrypted only when a letter is expanded.

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
      return { short: 'Waiting', className: 'status-pending', text: group ? `Waiting to print · ${group}` : 'Waiting to print' }
    case 'printed':
      return { short: 'Printed', className: 'status-pending', text: group ? `Printed by ${group}` : 'Printed' }
    case 'mailed':
      return { short: 'Mailed', className: 'status-mailed', text: group ? `Mailed by ${group}` : 'Mailed' }
    case 'returned':
      return { short: 'Returned', className: 'status-pending', text: 'Returned' }
    case 'received':
      return { short: 'Received', className: 'status-received', text: 'Received' }
  }
}

/** Why a queued letter is held, for its writer. */
function heldText(m: Message, prisonerName: string): string | null {
  switch (m.heldReason) {
    case 'choose_relay':
      return `${prisonerName} has been moved. This letter is waiting until you choose which group mails it now.`
    case 'reseal_needed':
      return `${prisonerName} has been moved. This letter is waiting to be shared with the group that now serves their facility.`
    case 'prisoner_free':
      return `${prisonerName} has been released. The group will decide whether this letter can still be sent.`
    default:
      return null
  }
}

function previewOf(m: Message, opened: OpenedLetter): string {
  if (opened.state === 'waiting') return 'Waiting to be shared with you'
  if (opened.state === 'unreadable') return 'This letter could not be opened'
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

function LetterItem({ item, initiallyOpen, prisonerName, writerName }: { item: OpenedMessage; initiallyOpen: boolean; prisonerName: string; writerName: string }) {
  const [open, setOpen] = useState(initiallyOpen)
  const { message: m, opened } = item
  const outbound = m.sender === 'user'
  const status = statusOf(m)
  const held = heldText(m, prisonerName)

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
        </div>
      )}
    </div>
  )
}

function Sidebar({ chat, letters, showWriter }: { chat: Chat; letters: OpenedMessage[]; showWriter: boolean }) {
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
              <strong>{chat.user_details.name ?? chat.user_details.username}</strong>
              {chat.user_details.managedBy && !chat.user_details.claimedAt && (
                <>
                  <br />
                  Managed by your group
                </>
              )}
            </div>
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
  const { user, keypair, groupKeypair, isChapter } = useAuth()
  const page = useApi(
    () => loadThread(id, { userId: user!.id, keypair: keypair!, chapterId: user!.chapterId, groupKeypair }),
    [id, user?.id],
  )

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
  const writerName = chat.user === user?.id ? (user.penName ?? user.username) : (chat.user_details?.name ?? chat.user_details?.username ?? 'Writer')

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
              />
            ))}
          </div>
          {/* TODO(Step 5, New Letter): the inline reply panel from thread.html. */}
        </main>

        <Sidebar chat={chat} letters={letters} showWriter={isChapter} />
      </div>
    </div>
  )
}
