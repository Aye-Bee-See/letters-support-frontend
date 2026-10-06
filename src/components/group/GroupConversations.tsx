import { useNavigate, useSearchParams } from 'react-router-dom'
import { getChats } from '../../api/letters'
import { useApi } from '../../hooks/useApi'
import type { Chat, PrisonSummary } from '../../types'
import { heldReasonShort, writerLabel } from '../../utils/groupLetters'
import { directionLabel, inboxDate, threadPrisonerName } from '../../utils/letters'
import { heldAt } from '../../utils/prisoners'
import LoadState from '../ui/LoadState'

// The group's conversations (group-admin-plan.md, WP1 "Conversations"): the
// threads of its managed writers and the threads holding a letter it relays,
// newest activity first, as GET /chat/chats lists them for a group (README
// "GET /chat/chats"). full=true adds the writer. The newest letter is worded
// from `last_message.heldReason` when it is held (API #178), and says whether it
// came from the prisoner. Nothing is decrypted here; the thread page opens them.

const PAGE_SIZE = 25

/** The newest letter, from the group's side: a reply recorded, or a letter and where it stands. */
function lastLetter(chat: Chat): { inbound: boolean; text: string } | null {
  const last = chat.last_message
  if (!last) return null
  if (last.sender === 'prisoner') return { inbound: true, text: 'reply from the prisoner' }
  if (last.status === 'queued' && last.heldReason) return { inbound: false, text: (heldReasonShort(last.heldReason) ?? 'Held').toLowerCase() }
  return directionLabel(last.sender, last.status, last.heldReason)
}

function ConversationRow({ chat }: { chat: Chat }) {
  const navigate = useNavigate()
  const last = lastLetter(chat)
  const facility = heldAt((chat.prisoner_details?.prison_details ?? null) as PrisonSummary | null)
  const open = () => navigate(`/threads/${chat.id}`)
  return (
    <tr
      className="convo-row"
      onClick={open}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open()
      }}
    >
      <td>
        <span className="convo-prisoner">{threadPrisonerName(chat)}</span>
        {facility && <div className="convo-facility">{facility}</div>}
      </td>
      <td>{writerLabel(chat.user_details)}</td>
      <td>
        {last && (
          <span className={last.inbound ? 'convo-direction inbound' : 'convo-direction outbound'}>
            <span className="arrow">{last.inbound ? '←' : '→'}</span> {last.text}
          </span>
        )}
        {chat.heldCount > 0 && !chat.last_message?.heldReason && (
          <div className="queue-sub">{chat.heldCount === 1 ? '1 letter on hold' : `${chat.heldCount} letters on hold`}</div>
        )}
      </td>
      <td>
        <span className="convo-date">{inboxDate(chat.lastMessageAt)}</span>
      </td>
    </tr>
  )
}

export default function GroupConversations() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const chats = useApi(() => getChats({ full: true, page, page_size: PAGE_SIZE }), [page])
  const pages = chats.data ? Math.max(1, Math.ceil(chats.data.total / PAGE_SIZE)) : 1
  const goPage = (n: number) => setParams({ tab: 'conversations', ...(n > 1 ? { page: String(n) } : {}) })

  return (
    <div className="inbox-section">
      <div className="inbox-section-header">
        <span className="inbox-section-title">Your group’s conversations</span>
      </div>
      <div className="inbox-card">
        <LoadState state={chats} what="the conversations" />
        {chats.data && chats.data.items.length === 0 && (
          <p className="convo-empty">No conversations yet: your writers’ threads, and threads with a letter your group mails, show here.</p>
        )}
        {chats.data && chats.data.items.length > 0 && (
          <table className="convo-table">
            <thead>
              <tr>
                <th className="col-prisoner">Prisoner</th>
                <th>Writer</th>
                <th className="col-direction">Last letter</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {chats.data.items.map((chat) => (
                <ConversationRow key={chat.id} chat={chat} />
              ))}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <div className="card-pagination">
            <span>
              Page {page} of {pages}
            </span>
            <div className="pagination-pages">
              <button type="button" className="page-btn" disabled={page <= 1} onClick={() => goPage(page - 1)}>
                ←
              </button>
              <button type="button" className="page-btn" disabled={page >= pages} onClick={() => goPage(page + 1)}>
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
