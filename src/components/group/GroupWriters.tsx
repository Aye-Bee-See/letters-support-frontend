import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getChats } from '../../api/letters'
import { getAllWriters } from '../../api/writers'
import { useApi } from '../../hooks/useApi'
import type { Chat, PrisonSummary, Writer } from '../../types'
import { writerLabel } from '../../utils/groupLetters'
import { inboxDate, threadPrisonerName } from '../../utils/letters'
import { heldAt } from '../../utils/prisoners'
import { shortDate } from '../../utils/dates'
import LoadState from '../ui/LoadState'
import LastLetter from './LastLetter'

// The group's managed writers (the inbox's Writers tab), as the
// prototype's org inbox shows them: one block per writer with their threads,
// and New letter, Hand off and Edit beside the name. GET /auth/writers lists the
// group's unclaimed writers, its anonymous writer among them (README "Managed
// writers"); that one is "Write anonymously" at the end instead. The buttons
// only link to the pages that do these (New Letter, Handoff, EditWriter).
//
// The writers come in one request; a writer's threads only when their block
// is opened (Show letters), one request for that writer's most recent ones
// (GET /chat/chats?user=), kept while the tab is open. Nothing fetches every
// thread the group can see.

/** How many of a writer's threads a block shows, most recent first. */
const THREADS_SHOWN = 20

/** One writer's most recent threads, fetched when their block is first opened. */
function WriterThreads({ writer }: { writer: number }) {
  const chats = useApi(() => getChats({ user: writer, page_size: THREADS_SHOWN }), [writer])
  if (!chats.data) return <LoadState state={chats} what="their letters" />
  if (chats.data.items.length === 0) return <p className="convo-empty">No letters yet.</p>
  return (
    <>
      <ThreadTable chats={chats.data.items} />
      {chats.data.total > chats.data.items.length && (
        <p className="convo-empty">
          The {chats.data.items.length} most recent of {chats.data.total}.
        </p>
      )}
    </>
  )
}

function ThreadTable({ chats }: { chats: Chat[] }) {
  const navigate = useNavigate()
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
          const facility = heldAt((chat.prisoner_details?.prison_details ?? null) as PrisonSummary | null)
          const open = () => {
            navigate(`/threads/${chat.id}`)
          }
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
                <LastLetter chat={chat} />
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

/**
 * Show letters / Hide letters for one block. Once opened, a block's threads
 * stay mounted (hidden when closed), so closing and opening again asks nothing.
 */
function ThreadsToggle({ open, controls, onToggle }: { open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button type="button" className="btn btn-sm writer-handoff-btn" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      {open ? 'Hide letters' : 'Show letters'}
    </button>
  )
}

export default function GroupWriters() {
  const page = useApi(getAllWriters, [])
  const writers = (page.data ?? []).filter((w) => w.anonymousForChapter == null)
  const anonymous = (page.data ?? []).find((w) => w.anonymousForChapter != null) ?? null
  // Blocks opened at least once (their threads fetched), and those open now.
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set())
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set())
  const toggle = (id: number) => {
    setOpened((s) => new Set(s).add(id))
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  /** The threads under a block: fetched on first opening, then kept. */
  const threads = (id: number) =>
    opened.has(id) && (
      <div className="inbox-card" id={`writer-${id}-letters`} hidden={!open.has(id)}>
        <WriterThreads writer={id} />
      </div>
    )

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
              <span className="writer-name">
                {writerLabel(w)}
                {/* The name the group knows them by, beside the pen name their letters are signed with. */}
                {w.penName && w.name && w.name !== w.penName ? ` · ${w.name}` : ''}
              </span>
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
                <ThreadsToggle open={open.has(w.id)} controls={`writer-${w.id}-letters`} onToggle={() => toggle(w.id)} />
              </div>
            </div>
            {threads(w.id)}
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
              {anonymous && (
                <ThreadsToggle open={open.has(anonymous.id)} controls={`writer-${anonymous.id}-letters`} onToggle={() => toggle(anonymous.id)} />
              )}
            </div>
          </div>
          {anonymous && threads(anonymous.id)}
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
