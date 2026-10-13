import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAllChats } from '../../api/letters'
import { getUnreadNotifications, markNotificationsRead } from '../../api/notifications'
import AppShell from '../../components/layout/AppShell'
import { BlocksNotice } from '../account/Blocks'
import LoadState from '../../components/ui/LoadState'
import StatusNotice from '../../components/ui/StatusNotice'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useSignOut } from '../../hooks/useSignOut'
import { announceUnreadCount } from '../../hooks/useUnreadCount'
import type { Chat, Notification, PrisonSummary } from '../../types'
import { directionLabel, inboxDate, needsWriter, threadPrisonerName } from '../../utils/letters'
import { isWorryingTag, wordEvent, writerEventTag } from '../../utils/notifications'
import { heldAt } from '../../utils/prisoners'

// Markup and classes from solidarity-site/inbox-writer.html (inbox.css). The
// list needs no decryption: who, where, and the last letter's direction and
// state. Letters are opened on the thread page. Above it, what the feed holds
// unread (README "The feed": a letter printed, mailed, returned or declined; the
// person moved or freed; a reply), and each row says what is new on it.

/** Unread entries listed above the conversations; the rest are counted. */
const SHOWN = 8

/** Threads, and the unread feed: what happened to the writer's letters and the people they write to. */
async function loadInbox() {
  const [chats, unread] = await Promise.all([getAllChats(), getUnreadNotifications().catch(() => [] as Notification[])])
  return { chats, unread }
}

/** What is new on each conversation, newest first, one tag each ("Returned", "Mailed"). */
function tagsByChat(unread: Notification[]): Map<number, string[]> {
  const tags = new Map<number, string[]>()
  for (const n of unread) {
    const tag = writerEventTag(n)
    if (n.chat == null || !tag) continue
    const list = tags.get(n.chat) ?? []
    if (!list.includes(tag)) list.push(tag)
    tags.set(n.chat, list)
  }
  return tags
}

/** The tags on a row: worrying ones in the thread's amber, the rest as its green "Mailed" pill. */
function NewsTags({ tags }: { tags: string[] }) {
  return (
    <div style={{ marginTop: '0.25rem' }}>
      {tags.map((tag) => (
        // thread.css's status pills, spaced inline.
        <span key={tag} className={`letter-collapsed-status ${isWorryingTag(tag) ? 'status-pending' : 'status-mailed'}`} style={{ marginRight: '0.6rem' }}>
          {tag}
        </span>
      ))}
    </div>
  )
}

/** Unread entries, worded for the writer, each linking to its conversation. Shown only when there are some. */
function WhatsNew({ unread, chats, onMarkedRead }: { unread: Notification[]; chats: Chat[]; onMarkedRead: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const names = new Map(chats.map((c) => [c.id, threadPrisonerName(c)]))
  const shown = unread.slice(0, SHOWN)

  async function markAll() {
    setBusy(true)
    setError(false)
    try {
      const result = await markNotificationsRead()
      announceUnreadCount(result.unread)
      onMarkedRead()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inbox-section">
      <div className="inbox-section-header">
        <span className="inbox-section-title">What’s new</span>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={markAll}>
          {busy ? 'Marking…' : 'Mark all as read'}
        </button>
      </div>
      <div className="inbox-card" style={{ padding: '0.25rem 1.25rem' }}>
        <ul className="activity-list" style={{ margin: 0 }}>
          {shown.map((n) => {
            const name = n.chat != null ? names.get(n.chat) : undefined
            const text = wordEvent(n, { forWriter: true, prisonerName: name })
            return (
              <li key={n.id} className="activity-item unread">
                {name ? <Link to={`/threads/${n.chat}`}>{text}</Link> : text}
                <span className="activity-date">{inboxDate(n.createdAt)}</span>
              </li>
            )
          })}
        </ul>
        {unread.length > shown.length && (
          <p className="sidebar-info">And {unread.length - shown.length} more: open a conversation to read what happened in it.</p>
        )}
        {error && (
          <p className="sidebar-info" role="alert" style={{ color: 'var(--alert)' }}>
            Couldn’t mark them read. Try again.
          </p>
        )}
      </div>
    </div>
  )
}

function ConvoRow({ chat, news }: { chat: Chat; news: string[] }) {
  const navigate = useNavigate()
  const last = chat.last_message
  const direction = last ? directionLabel(last.sender, last.status, last.heldReason) : null
  const prisoner = chat.prisoner_details
  const facility = heldAt((prisoner?.prison_details ?? null) as PrisonSummary | null)
  const open = () => {
    navigate(`/threads/${chat.id}`)
  }

  return (
    <tr
      className={news.length > 0 ? 'convo-row unread' : 'convo-row'}
      onClick={open}
      tabIndex={0}
      onKeyDown={(e) => {
        // The row's own keys only: Enter on the prisoner link inside it is the link's (one history entry, not two).
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      <td>
        {prisoner ? (
          <Link to={`/prisoners/${prisoner.id}`} className="convo-prisoner-link" onClick={(e) => e.stopPropagation()}>
            <span className="convo-prisoner">{threadPrisonerName(chat)}</span>
          </Link>
        ) : (
          <span className="convo-prisoner">{threadPrisonerName(chat)}</span>
        )}
        {facility && <div className="convo-facility">{facility}</div>}
        {/* What happened since the writer last looked (unread feed entries on this thread). */}
        {news.length > 0 && <NewsTags tags={news} />}
        {/* Letters held until the writer acts (the prisoner moved, or the group changed); other holds are the group's to settle. */}
        {needsWriter(chat) ? <StatusNotice text="Needs your attention" /> : chat.heldCount > 0 && <StatusNotice text="A letter is on hold" />}
      </td>
      <td>
        {direction && (
          <span className={direction.inbound ? 'convo-direction inbound' : 'convo-direction outbound'}>
            <span className="arrow">{direction.inbound ? '←' : '→'}</span> {direction.text}
          </span>
        )}
      </td>
      <td>
        {/* A real link to the conversation, beside the row's own click. */}
        <Link to={`/threads/${chat.id}`} className="convo-thread-link" onClick={(e) => e.stopPropagation()} aria-label={`Open the conversation with ${threadPrisonerName(chat)}`}>
          <span className="convo-date">{inboxDate(chat.lastMessageAt)}</span>
        </Link>
      </td>
    </tr>
  )
}

export default function InboxWriter() {
  const { user } = useAuth()
  const signOut = useSignOut()
  const inbox = useApi(loadInbox, [])
  const chats = { ...inbox, data: inbox.data?.chats ?? null }
  const unread = inbox.data?.unread ?? []
  const news = tagsByChat(unread)

  const sidebar = (
    <>
      <Link to="/letters/new" className="sidebar-new-letter">
        + New letter
      </Link>

      {/* Everyday-screen wording (CLAUDE.md): no key language; the explanation is one link away. */}
      <p className="sidebar-heading">Privacy</p>
      <p className="sidebar-info">
        Only <strong>you</strong>, and the group that prints and mails a letter, can read it. Not the people who run this
        site. <Link to="/about">How is this protected?</Link>
      </p>

      <hr className="sidebar-divider" />

      <p className="sidebar-heading">Who mails your letters</p>
      <p className="sidebar-info">
        Each letter is printed and mailed by a support group that serves the prisoner's facility. The thread shows which.
      </p>

      <hr className="sidebar-divider" />

      <div className="sidebar-account">
        Signed in as
        <br />
        <strong>{user?.penName ?? user?.username}</strong>
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault()
            signOut()
          }}
        >
          Sign out
        </a>
      </div>
    </>
  )

  return (
    <AppShell sidebar={sidebar}>
      <title>Inbox · letters.support</title>
      <div className="inbox-hero">
        <p className="inbox-hero-sub">Signed in as</p>
        <h1 className="inbox-hero-title">{user?.penName ?? user?.username}</h1>
      </div>

      <BlocksNotice />
      {inbox.data && unread.length > 0 && <WhatsNew unread={unread} chats={inbox.data.chats} onMarkedRead={inbox.reload} />}

      <div className="inbox-section">
        <div className="inbox-section-header">
          <span className="inbox-section-title">Your conversations</span>
        </div>

        <div className="inbox-card">
          <LoadState state={chats} what="your conversations" />
          {chats.data && chats.data.length === 0 && (
            <p className="convo-empty">
              No letters yet. <Link to="/prisoners">Find someone to write to</Link>, or start a{' '}
              <Link to="/letters/new">new letter</Link>.
            </p>
          )}
          {chats.data && chats.data.length > 0 && (
            <table className="convo-table">
              <thead>
                <tr>
                  <th className="col-prisoner">Prisoner</th>
                  <th className="col-direction">Last letter</th>
                  <th className="col-date">Date</th>
                </tr>
              </thead>
              <tbody>
                {chats.data.map((chat) => (
                  <ConvoRow key={chat.id} chat={chat} news={news.get(chat.id) ?? []} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  )
}
