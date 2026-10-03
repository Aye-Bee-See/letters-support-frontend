import { Link, useNavigate } from 'react-router-dom'
import { getAllChats } from '../../api/letters'
import { getUnreadNotifications } from '../../api/notifications'
import AppShell from '../../components/layout/AppShell'
import LoadState from '../../components/ui/LoadState'
import StatusNotice from '../../components/ui/StatusNotice'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { Chat, PrisonSummary } from '../../types'
import { directionLabel, inboxDate, needsWriter, threadPrisonerName } from '../../utils/letters'
import { heldAt } from '../../utils/prisoners'

// Markup and classes from solidarity-site/inbox-writer.html (inbox.css). The
// list needs no decryption: who, where, and the last letter's direction and
// state. Letters are opened on the thread page.

/** Threads, and which have a reply not yet seen (an unread `letter.reply` notification). */
async function loadInbox() {
  const [chats, unread] = await Promise.all([getAllChats(), getUnreadNotifications().catch(() => [])])
  const unreadChats = new Set(unread.filter((n) => n.event === 'letter.reply' && n.chat != null).map((n) => n.chat as number))
  return { chats, unreadChats }
}

function ConvoRow({ chat, unread }: { chat: Chat; unread: boolean }) {
  const navigate = useNavigate()
  const last = chat.last_message
  const direction = last ? directionLabel(last.sender, last.status, chat.heldCount > 0) : null
  const prisoner = chat.prisoner_details
  const facility = heldAt((prisoner?.prison_details ?? null) as PrisonSummary | null)
  const open = () => navigate(`/threads/${chat.id}`)

  return (
    <tr
      className={unread ? 'convo-row unread' : 'convo-row'}
      onClick={open}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open()
      }}
    >
      <td>
        {unread && <span className="unread-dot"></span>}
        {prisoner ? (
          <Link to={`/prisoners/${prisoner.id}`} className="convo-prisoner-link" onClick={(e) => e.stopPropagation()}>
            <span className="convo-prisoner">{threadPrisonerName(chat)}</span>
          </Link>
        ) : (
          <span className="convo-prisoner">{threadPrisonerName(chat)}</span>
        )}
        {facility && <div className="convo-facility">{facility}</div>}
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
        <span className="convo-date">{inboxDate(chat.lastMessageAt)}</span>
      </td>
    </tr>
  )
}

export default function InboxWriter() {
  const { user, endSession } = useAuth()
  const navigate = useNavigate()
  const inbox = useApi(loadInbox, [])
  const chats = { ...inbox, data: inbox.data?.chats ?? null }

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
            endSession()
            navigate('/')
          }}
        >
          Sign out
        </a>
      </div>
    </>
  )

  return (
    <AppShell sidebar={sidebar}>
      <div className="inbox-hero">
        <p className="inbox-hero-sub">Signed in as</p>
        <h1 className="inbox-hero-title">{user?.penName ?? user?.username}</h1>
      </div>

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
                  <ConvoRow key={chat.id} chat={chat} unread={inbox.data?.unreadChats.has(chat.id) ?? false} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  )
}
