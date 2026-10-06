import { Link, useNavigate } from 'react-router-dom'
import { getAllChats } from '../../api/letters'
import { getWriters } from '../../api/writers'
import { useApi } from '../../hooks/useApi'
import type { Chat, PrisonSummary, Writer } from '../../types'
import { heldReasonShort } from '../../utils/groupLetters'
import { directionLabel, inboxDate, threadPrisonerName } from '../../utils/letters'
import { heldAt, shortDate } from '../../utils/prisoners'
import LoadState from '../ui/LoadState'

// The group's managed writers (group-admin-plan.md, WP1 "Writers"), as the
// prototype's org inbox shows them: one block per writer with their threads,
// and New letter, Hand off and Edit beside the name. GET /auth/writers lists the
// group's unclaimed writers, its anonymous writer among them (README "Managed
// writers"); that one is "Write anonymously" at the end instead. The pages the
// buttons open are other packages' (WP2): this only links to them.

async function loadWriters() {
  const [writers, chats] = await Promise.all([getWriters({ page_size: 100 }), getAllChats()])
  return { writers: writers.items, chats }
}

function WriterThreads({ chats }: { chats: Chat[] }) {
  const navigate = useNavigate()
  if (chats.length === 0) return <p className="convo-empty">No letters yet.</p>
  return (
    <table className="convo-table">
      <thead>
        <tr>
          <th className="col-prisoner">Prisoner</th>
          <th className="col-direction">Last letter</th>
          <th className="col-date">Date</th>
        </tr>
      </thead>
      <tbody>
        {chats.map((chat) => {
          const last = chat.last_message
          const direction = last ? directionLabel(last.sender, last.status, last.heldReason) : null
          const held = last?.sender === 'user' && last.status === 'queued' ? heldReasonShort(last.heldReason) : null
          const facility = heldAt((chat.prisoner_details?.prison_details ?? null) as PrisonSummary | null)
          const open = () => navigate(`/threads/${chat.id}`)
          return (
            <tr
              key={chat.id}
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
              <td>
                {direction && (
                  <span className={direction.inbound ? 'convo-direction inbound' : 'convo-direction outbound'}>
                    <span className="arrow">{direction.inbound ? '←' : '→'}</span> {held ? held.toLowerCase() : direction.text}
                  </span>
                )}
              </td>
              <td>
                <span className="convo-date">{inboxDate(chat.lastMessageAt)}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** What the group should know about a writer at a glance: a live hand-off, or no keys yet. */
function writerState(w: Writer): string | null {
  if (w.claimToken) return `Hand-off code issued, good until ${shortDate(w.claimToken.expiresAt)}`
  if (!w.publicKey) return 'No keys yet'
  return null
}

export default function GroupWriters() {
  const page = useApi(loadWriters, [])
  const writers = (page.data?.writers ?? []).filter((w) => w.anonymousForChapter == null)
  const anonymous = (page.data?.writers ?? []).find((w) => w.anonymousForChapter != null) ?? null
  const chatsOf = (id: number) => (page.data?.chats ?? []).filter((c) => c.user === id)

  return (
    <div className="inbox-section">
      <LoadState state={page} what="your writers" />
      {page.data && writers.length === 0 && (
        <p className="convo-empty">
          Your group manages no writers yet. A managed writer is an account your group writes for, until you hand it to them.
        </p>
      )}
      {writers.map((w) => {
        const state = writerState(w)
        return (
          <div key={w.id} className="writer-block">
            <div className="writer-block-header">
              <span className="writer-name">{w.penName || w.name || w.username}</span>
              {state && <span className="writer-meta">{state}</span>}
              <div className="writer-block-actions">
                <Link to={`/letters/new?writer=${w.id}`} className="btn btn-sm writer-new-letter-btn">
                  + New letter
                </Link>
                <Link to={`/writers/${w.id}/handoff`} className="btn btn-sm writer-handoff-btn">
                  Hand off
                </Link>
                <Link to={`/writers/${w.id}/edit`} className="btn btn-sm writer-handoff-btn">
                  Edit
                </Link>
              </div>
            </div>
            <div className="inbox-card">
              <WriterThreads chats={chatsOf(w.id)} />
            </div>
          </div>
        )
      })}

      {page.data && (
        <div className="writer-block">
          <div className="writer-block-header">
            <span className="writer-name">Anonymous</span>
            <span className="writer-meta">Letters signed by your group, with no writer’s name</span>
            <div className="writer-block-actions">
              <Link to="/letters/new?writer=anonymous" className="btn btn-sm writer-new-letter-btn">
                + Write anonymously
              </Link>
            </div>
          </div>
          {anonymous && (
            <div className="inbox-card">
              <WriterThreads chats={chatsOf(anonymous.id)} />
            </div>
          )}
        </div>
      )}

      <div className="add-writer-row">
        <Link to="/writers/new" className="btn btn-sm btn-primary">
          + Add a writer
        </Link>
      </div>
    </div>
  )
}
