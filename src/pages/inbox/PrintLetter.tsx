import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getFacility } from '../../api/facilities'
import { getAttachments, getMessage } from '../../api/letters'
import DeclineLetter from '../../components/group/DeclineLetter'
import MarkLetter from '../../components/group/MarkLetter'
import PrintSheet, { PrintPageStyle } from '../../components/group/PrintSheet'
import ReturnLetter from '../../components/group/ReturnLetter'
import ShareLetter from '../../components/group/ShareLetter'
import LoadState from '../../components/ui/LoadState'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useGroup, type GroupKeyState } from '../../hooks/useGroup'
import { openAttachment, openLetter, type LetterReader, type OpenedLetter } from '../../letters/open'
import type { Attachment, LetterStatus, MailRule, Message, Prison } from '../../types'
import { addressLines } from '../../utils/facilities'
import { declineText, heldPrintQuestion, heldReasonText, returnReasonText, writerLabel, type QueueFilter } from '../../utils/groupLetters'
import { inboxDate, oldKeyText } from '../../utils/letters'
import { displayName } from '../../utils/prisoners'

// One letter, for the group that mails it (group-admin-plan.md, WP1), at
// /letters/:id/print. The letter is read with full=true (README "GET
// /messaging/message"): the prisoner and facility with its mail rules, the
// writer, the status history, and `footer` (README "Reply reference"). It is
// opened with the group key (src/letters/open.ts). The print sheet is the
// letter's text, the footer sentence and the enclosed images, and nothing
// else (every note around it is no-print): no QR code or barcode ever goes
// inside a prison. The sidebar has the address for the
// envelope and the actions: mark printed or mailed, it came back, don't send,
// share with a partner group.

interface Page {
  message: Message
  facility: Prison | null
  opened: OpenedLetter | null
}

async function loadLetter(id: number, reader: LetterReader | null): Promise<Page> {
  const message = await getMessage(id, true)
  const prisonId = message.prisoner_details?.prison ?? null
  // The facility's relay groups (partners to share with) and, if the letter's own copy lacks them, its rules.
  const facility = prisonId ? await getFacility(prisonId, true).catch(() => null) : null
  const opened = reader ? await openLetter(message, reader) : null
  return { message, facility, opened }
}

const STATUS_WORDS: Record<LetterStatus, string> = {
  queued: 'Waiting to be printed',
  printed: 'Printed, waiting to be mailed',
  mailed: 'Mailed',
  received: 'A reply from the prisoner',
  returned: 'Came back',
  declined: 'Not sent',
}

/** One step of the letter's history. */
const HISTORY_WORDS: Record<LetterStatus, string> = {
  queued: 'written',
  printed: 'printed',
  mailed: 'mailed',
  received: 'recorded',
  returned: 'came back',
  declined: 'not sent',
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** The queue filter this letter sits under, for the way back. */
const filterOf = (m: Message): QueueFilter => (m.status === 'queued' ? (m.heldReason ? 'held' : 'queued') : m.status === 'received' ? 'queued' : m.status)

interface OpenedFile {
  attachment: Attachment
  url: string | null
}

/** The letter's attachments, fetched and decrypted with its content key (as Thread.tsx does). */
function useLetterFiles(messageId: number, contentKey: Uint8Array | null): OpenedFile[] | null {
  const [files, setFiles] = useState<{ key: Uint8Array; list: OpenedFile[] } | null>(null)
  useEffect(() => {
    if (!contentKey) return
    let current = true
    const urls: string[] = []
    getAttachments(messageId)
      .then((rows) =>
        Promise.all(
          rows.map(async (attachment) => {
            try {
              const url = URL.createObjectURL(await openAttachment(attachment, contentKey))
              urls.push(url)
              return { attachment, url }
            } catch {
              return { attachment, url: null }
            }
          }),
        ),
      )
      .then((list) => current && setFiles({ key: contentKey, list }))
      .catch(() => current && setFiles({ key: contentKey, list: [] }))
    return () => {
      current = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [messageId, contentKey])
  if (!contentKey) return []
  return files?.key === contentKey ? files.list : null
}

function KeyMissing({ keyState }: { keyState: GroupKeyState }) {
  return (
    <div className="group-message no-print">
      {keyState === 'no-key'
        ? 'This letter can’t be opened until a group admin sets up your group key.'
        : 'This letter can’t be opened until the group-owner admin hands you the group key.'}{' '}
      <Link to="/settings/keys">Group key</Link>
    </div>
  )
}

function Unopened({ opened }: { opened: OpenedLetter }) {
  if (opened.state === 'waiting')
    return <div className="group-message is-error no-print">Your group holds no copy of this letter’s key, so it can’t be opened here.</div>
  if (opened.state === 'old-key') return <div className="group-message is-error no-print">{oldKeyText(opened.sealedWith, opened.holding).long}</div>
  if (opened.state === 'unreadable')
    return <div className="group-message is-error no-print">This letter couldn’t be opened with your group’s key. Try signing in again.</div>
  return null
}

function Sidebar({ page, mine, rules, canRead, onDone }: { page: Page; mine: boolean; rules: MailRule[]; canRead: boolean; onDone: (text: string) => void }) {
  const { message: m, facility, opened } = page
  const prisoner = m.prisoner_details
  const prison = (prisoner?.prison_details ?? facility) as Prison | null
  // The facility's other active groups: the API lets those read it (README "Sending and reading letters").
  const partners = (facility?.relay_groups ?? []).filter(
    (g) => g.id !== m.relayChapter && (g.accountStatus === undefined || g.accountStatus === 'active'),
  )
  const history = m.status_history ?? []

  return (
    <aside className="thread-sidebar no-print">
      <div className="thread-sidebar-section">
        <div className="thread-sidebar-heading">Status</div>
        <div className="thread-sidebar-info">
          <strong>{STATUS_WORDS[m.status]}</strong>
          {m.paper && (
            <>
              <br />
              Written on paper
            </>
          )}
        </div>
        {history.length > 0 && (
          <ul className="letter-history">
            {history.map((h) => (
              <li key={h.id}>
                {inboxDate(h.createdAt)}: {HISTORY_WORDS[h.toStatus]}
              </li>
            ))}
          </ul>
        )}
      </div>

      {mine && m.sender === 'user' && ['queued', 'printed', 'mailed'].includes(m.status) && (
        <>
          <hr className="thread-sidebar-divider" />
          <div className="thread-sidebar-section">
            <div className="thread-sidebar-heading">What to do with it</div>
            <MarkLetter message={m} canPrint={canRead || m.paper} onDone={onDone} />
            <ReturnLetter message={m} onDone={onDone} />
            <DeclineLetter message={m} rules={rules} onDone={onDone} />
            {opened?.state === 'open' && m.status !== 'mailed' && (
              <ShareLetter messageId={m.id} partners={partners} contentKey={opened.contentKey} />
            )}
          </div>
        </>
      )}
      {!mine && m.relay_group && (
        <>
          <hr className="thread-sidebar-divider" />
          <div className="thread-sidebar-section">
            <div className="thread-sidebar-info">
              {m.relay_group.name} mails this letter, so only that group can mark it or decline it.
            </div>
          </div>
        </>
      )}

      {prisoner && (
        <>
          <hr className="thread-sidebar-divider" />
          <div className="thread-sidebar-section">
            <div className="thread-sidebar-heading">Address the envelope</div>
            <div className="thread-sidebar-info">
              <strong>{prisoner.birthName || prisoner.chosenName}</strong>
              {prisoner.inmateID && (
                <>
                  <br />
                  No. {prisoner.inmateID}
                </>
              )}
              {prisoner.chosenName && prisoner.birthName && prisoner.chosenName !== prisoner.birthName && (
                <>
                  <br />
                  Goes by {prisoner.chosenName}
                </>
              )}
            </div>
            {prison && (
              <div className="thread-sidebar-address">
                {addressLines(prison).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {rules.length > 0 && (
        <>
          <hr className="thread-sidebar-divider" />
          <div className="thread-sidebar-section">
            <div className="thread-sidebar-heading">The facility’s mail rules</div>
            <ul className="letter-history">
              {rules.map((r) => (
                <li key={r.tag}>{r.label}</li>
              ))}
            </ul>
            {prison?.pageLimit != null && <div className="thread-sidebar-info">At most {prison.pageLimit} pages.</div>}
          </div>
        </>
      )}
    </aside>
  )
}

export default function PrintLetter() {
  const id = Number(useParams().id)
  const { user, keypair, groupKeypair, keys } = useAuth()
  const group = useGroup()
  const ready = group.keyState === 'ready' && !!keypair && !!groupKeypair
  const reader: LetterReader | null = ready && user ? { userId: user.id, keypair: keypair!, chapterId: user.chapterId, groupKeypair, groupKeyVersion: keys?.orgKey?.keyVersion ?? null } : null
  const page = useApi(() => loadLetter(id, reader), [id, ready, user?.id])
  const [flash, setFlash] = useState<string | null>(null)
  // The letter as re-read after an action (its status, history and footer), so
  // marking it keeps the opened text and attachments rather than reloading and
  // decrypting the whole page again. Tied to the load it updates, so a later
  // reload of the page (keys arriving, another letter) is not overridden.
  const [fresh, setFresh] = useState<{ base: Page; message: Message } | null>(null)

  const opened = page.data?.opened ?? null
  const contentKey = opened?.state === 'open' ? opened.contentKey : null
  const files = useLetterFiles(id, contentKey)

  if (!page.data) {
    return (
      <div className="app-wrap">
        <PrintPageStyle />
        <div className="wrap">
          <LoadState state={page} what="letter" />
        </div>
      </div>
    )
  }

  const { facility } = page.data
  const base = page.data
  const m = fresh?.base === base ? fresh.message : base.message
  const mine = m.relayChapter !== null && m.relayChapter === group.chapterId
  const prisoner = m.prisoner_details
  const prison = (prisoner?.prison_details ?? facility) as Prison | null
  const rules = (prison?.mail_rule_details ?? facility?.mail_rule_details ?? []).filter((r) => !r.retired)
  const images = (files ?? []).filter((f) => f.url && f.attachment.mimeType.startsWith('image/'))
  const others = (files ?? []).filter((f) => !f.url || !f.attachment.mimeType.startsWith('image/'))
  const held = m.status === 'queued' ? heldReasonText(m.heldReason) : null
  // A held letter is printed only on purpose (README "Moved and freed"): asked here as well as on Mark printed.
  const printLetter = () => {
    const question = m.status === 'queued' ? heldPrintQuestion(m.heldReason) : null
    if (question && !window.confirm(question)) return
    window.print()
  }

  // Only the letter's record changes on an action; a failed re-read falls back to reloading the page.
  const done = (text: string) => {
    setFlash(text)
    getMessage(id, true).then((message) => setFresh({ base, message }), () => page.reload())
  }

  return (
    <div className="app-wrap">
      {/* The print stylesheet applies only while this page is open (group-inbox.css). */}
      <PrintPageStyle />
      <div className="app-layout">
        <main className="thread-main">
          <div className="thread-header no-print">
            <Link to={`/inbox?tab=print&filter=${filterOf(m)}`} className="thread-back">
              ← Back to the queue
            </Link>
            <h1 className="thread-title">Letter to {prisoner ? displayName(prisoner) : 'a prisoner not in the directory'}</h1>
            <div className="thread-meta">
              {prison && <span>{prison.prisonName}</span>}
              {prison && <span>·</span>}
              <span>
                Writer: <span className="thread-meta-writer">{writerLabel(m.user_details)}</span>
              </span>
              <span>·</span>
              <span>
                Letter {m.id}, written {inboxDate(m.createdAt)}
              </span>
              <span>·</span>
              <Link to={`/threads/${m.chat}`}>Conversation</Link>
              {/* The prisoner's answer to this letter, filed by its reply reference (README "Reply reference"):
                  only once it is in the post, since a letter not yet mailed or not sent has no answer. */}
              {m.replyReference && m.status === 'mailed' && (
                <>
                  <span>·</span>
                  <Link to={`/replies/new?reply=${encodeURIComponent(m.replyReference)}`}>Record the reply to this letter</Link>
                </>
              )}
            </div>
          </div>

          {flash && (
            <div className="group-message is-done no-print" role="status">
              {flash}
            </div>
          )}
          {held && <div className="group-message is-error no-print">{held}. Printing it has to be confirmed.</div>}
          {m.status === 'returned' && (
            <div className="group-message no-print">
              Came back: {lowerFirst(returnReasonText(m.returnReason))}.{m.returnNote ? ` The note says: “${m.returnNote}”` : ''}
            </div>
          )}
          {m.status === 'declined' && (
            <div className="group-message no-print">
              Not sent: {lowerFirst(declineText(m))}.{m.declineNote ? ` The note says: “${m.declineNote}”` : ''}
            </div>
          )}

          {!ready && <KeyMissing keyState={group.keyState} />}
          {opened && <Unopened opened={opened} />}

          {opened?.state === 'open' && (
            <>
              {opened.relayNote && (
                <div className="print-relay-note no-print">
                  <strong>The writer’s note to your group</strong> (not printed): {opened.relayNote}
                </div>
              )}

              {m.status !== 'declined' && (
                <div className="print-toolbar no-print">
                  {/* Printing before the images are decrypted would leave them off the sheet. */}
                  <button type="button" className="btn btn-sm btn-primary" onClick={printLetter} disabled={files === null}>
                    {files === null ? 'Preparing attachments…' : 'Print'}
                  </button>
                  <span>
                    {m.paper
                      ? 'Prints the footer only, to copy onto the paper letter or enclose.'
                      : images.length > 0
                        ? 'Prints the letter, its footer and the enclosed images, nothing else.'
                        : 'Prints the letter and its footer, nothing else.'}
                  </span>
                </div>
              )}
              {m.footer?.replySheetAllowed && (
                <p className="print-note no-print">
                  This facility allows a reply sheet: you may enclose a blank page with your group’s address
                  {m.footer.reference ? ` and the reference ${m.footer.reference}` : ''}. It counts toward the page limit.
                </p>
              )}
              {m.footer && m.footer.reference === null && (
                <p className="print-note no-print">This facility’s mail room refuses unexplained numbers, so the footer leaves the reference out.</p>
              )}

              <PrintSheet message={m} text={opened.text} images={images} />

              {files === null && m.status === 'declined' && <p className="print-note no-print">Opening attachments…</p>}
              {(others.length > 0 || (m.paper && images.length > 0)) && (
                <div className="no-print">
                  <p className="thread-sidebar-heading">Attachments</p>
                  {(m.paper ? files ?? [] : others).map((f) => (
                    <div key={f.attachment.id} className="letter-body-scan">
                      <span className="letter-body-scan-icon">📄</span>
                      <span className="letter-body-scan-name">
                        {f.attachment.originalName ?? 'Attachment'} · {(f.attachment.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      {f.url ? (
                        <a className="letter-body-scan-note" href={f.url} target="_blank" rel="noopener noreferrer" download={f.attachment.originalName ?? undefined}>
                          Open
                        </a>
                      ) : (
                        <span className="letter-body-scan-note">This file couldn’t be opened.</span>
                      )}
                    </div>
                  ))}
                  {!m.paper && <p className="print-note">These aren’t on the print sheet: open and print them separately.</p>}
                </div>
              )}
            </>
          )}
        </main>

        <Sidebar page={{ ...page.data, message: m }} mine={mine} rules={rules} canRead={opened?.state === 'open'} onDone={done} />
      </div>
    </div>
  )
}
