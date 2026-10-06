import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../api/client'
import { getMessages, setLetterStatusBatch } from '../../api/letters'
import { useApi } from '../../hooks/useApi'
import type { GroupKeyState } from '../../hooks/useGroup'
import type { Message, Prison } from '../../types'
import {
  declineText,
  EMPTY_QUEUE,
  heldReasonShort,
  heldReasonText,
  QUEUE_FILTERS,
  queueFilter,
  returnReasonText,
  statusRefusal,
  writerLabel,
  type QueueFilter,
} from '../../utils/groupLetters'
import { inboxDate } from '../../utils/letters'
import { displayName } from '../../utils/prisoners'
import FilterChip from '../ui/FilterChip'
import LoadState from '../ui/LoadState'
import StatusNotice from '../ui/StatusNotice'

// The group's print queue (group-admin-plan.md, WP1 "To print"). Rows come from
// GET /messaging/messages?relayChapter=&status=&held=&full=true (README "GET
// /messaging/messages"): full=true adds the prisoner, their facility and the
// writer, so a page of the queue needs no request per letter and nothing here is
// decrypted. Marking goes through PUT /messaging/status/batch, all or none
// (README "PUT /messaging/status/batch"); a held letter is printed only with
// `release: true`, after the group admin confirms (README "Moved and freed").

const PAGE_SIZE = 50

/** What a filter's selected letters can be marked as, if anything. */
const BATCH_MOVE: Partial<Record<QueueFilter, { target: 'printed' | 'mailed'; label: string; release?: true }>> = {
  queued: { target: 'printed', label: 'Mark printed' },
  held: { target: 'printed', label: 'Mark printed', release: true },
  printed: { target: 'mailed', label: 'Mark mailed' },
}

/** The date a row shows, and what it means for this filter. */
const DATE_HEADING: Record<QueueFilter, string> = {
  queued: 'Written',
  held: 'Written',
  printed: 'Printed',
  mailed: 'Mailed',
  returned: 'Came back',
  declined: 'Declined',
}

const rowDate = (m: Message, filter: QueueFilter) =>
  filter === 'queued' || filter === 'held' ? m.createdAt : (m.statusChangedAt ?? m.createdAt)

/** Why letters can't be opened or printed yet: the gate's banner says it at the top; this says it where the letters would be. */
function KeyHint({ keyState }: { keyState: GroupKeyState }) {
  if (keyState === 'ready') return null
  return (
    <>
      {' '}
      {keyState === 'no-key'
        ? 'Letters can’t be opened or printed until a group admin sets up your group key'
        : 'Letters can’t be opened or printed until the group-owner admin hands you the group key'}
      : <Link to="/settings/keys">Group key</Link>.
    </>
  )
}

function QueueRow({
  m,
  filter,
  selectable,
  selected,
  onToggle,
}: {
  m: Message
  filter: QueueFilter
  selectable: boolean
  selected: boolean
  onToggle: () => void
}) {
  const prisoner = m.prisoner_details
  const prison = (prisoner?.prison_details ?? null) as Prison | null
  const held = heldReasonShort(m.heldReason)
  return (
    <tr className={selected ? 'queue-row is-selected' : 'queue-row'}>
      {selectable && (
        <td className="col-check">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select letter ${m.id}`} />
        </td>
      )}
      <td>
        <span className="convo-prisoner">{prisoner ? displayName(prisoner) : 'Prisoner not in the directory'}</span>
        {m.paper && <span className="paper-badge" title="Written on paper: nothing to print">paper</span>}
        <div className="queue-sub">
          {prison?.prisonName ?? 'No facility listed'} · <span className="queue-id">letter {m.id}</span>
        </div>
        {held && (
          <span title={heldReasonText(m.heldReason) ?? undefined}>
            <StatusNotice text={held} />
          </span>
        )}
        {m.status === 'returned' && <div className="queue-sub">{returnReasonText(m.returnReason)}</div>}
        {m.status === 'declined' && <div className="queue-sub">{declineText(m)}</div>}
      </td>
      <td>{writerLabel(m.user_details)}</td>
      <td>
        <span className="convo-date">{inboxDate(rowDate(m, filter))}</span>
      </td>
      <td>
        <Link to={`/letters/${m.id}/print`} className="queue-open">
          {filter === 'queued' || filter === 'held' ? 'Open and print' : 'Open'}
        </Link>
      </td>
    </tr>
  )
}

/** One filter's page of letters, with selection and the batch move. Keyed on the filter and page, so both reset. */
function QueueList({ chapterId, filter, page, keyState }: { chapterId: number; filter: QueueFilter; page: number; keyState: GroupKeyState }) {
  const [, setParams] = useSearchParams()
  const spec = queueFilter(filter)
  const list = useApi(
    () => getMessages({ relayChapter: chapterId, status: spec.status, held: spec.held, full: true, page, page_size: PAGE_SIZE }),
    [chapterId, filter, page],
  )
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'error' | 'done'; text: string } | null>(null)

  const move = BATCH_MOVE[filter]
  const rows = list.data?.items ?? []
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1
  // Printing needs the letters open; marking mailed only needs them on paper already.
  const canMove = !!move && (move.target === 'mailed' || keyState === 'ready')
  const chosen = rows.filter((m) => selected.has(m.id)).map((m) => m.id)

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allChosen = rows.length > 0 && chosen.length === rows.length

  async function run() {
    if (!move || chosen.length === 0) return
    setBusy(true)
    setNotice(null)
    try {
      const done = await setLetterStatusBatch(chosen, { status: move.target, ...(move.release ? { release: true } : {}) })
      setNotice({ kind: 'done', text: `${done.count === 1 ? '1 letter' : `${done.count} letters`} marked ${move.target}.` })
      setSelected(new Set())
      setConfirming(false)
      list.reload()
    } catch (err) {
      setNotice({ kind: 'error', text: statusRefusal(toApiError(err), chosen, move.target) })
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  const goPage = (n: number) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (n > 1) next.set('page', String(n))
      else next.delete('page')
      return next
    })

  return (
    <div className="inbox-card">
      {notice && (
        <div className={notice.kind === 'error' ? 'group-message is-error' : 'group-message is-done'} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
          {notice.kind === 'error' && (
            <div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setSelected(new Set())
                  setNotice(null)
                  list.reload()
                }}
              >
                Reload the list
              </button>
            </div>
          )}
        </div>
      )}

      {move && rows.length > 0 && (
        <div className="queue-batch-bar">
          <span>{chosen.length === 0 ? 'Select letters to mark them together.' : `${chosen.length} selected`}</span>
          {!confirming && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!canMove || chosen.length === 0 || busy}
              onClick={() => (move.release ? setConfirming(true) : run())}
            >
              {busy ? 'Marking…' : move.label}
            </button>
          )}
          {move.target === 'printed' && keyState !== 'ready' && (
            <span>
              <KeyHint keyState={keyState} />
            </span>
          )}
        </div>
      )}

      {confirming && move?.release && (
        <div className="group-message is-error" role="alert">
          <p>
            {chosen.length === 1 ? 'This letter is' : `These ${chosen.length} letters are`} on hold. A held letter may never reach the
            person, or its writer may still have to act on it; open {chosen.length === 1 ? 'it' : 'each one'} to see why.
          </p>
          <p>Print {chosen.length === 1 ? 'it' : 'them'} anyway?</p>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={run}>
            {busy ? 'Marking…' : 'Yes, print anyway'}
          </button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}

      <LoadState state={list} what="the letters" />
      {list.data && rows.length === 0 && (
        <p className="convo-empty">
          {EMPTY_QUEUE[filter]}
          {filter === 'queued' && keyState === 'no-key' && ' No letter can be sent through your group until it has a group key.'}
          {(filter === 'queued' || filter === 'held') && keyState === 'not-held' && <KeyHint keyState={keyState} />}
        </p>
      )}
      {rows.length > 0 && (
        <table className="convo-table queue-table">
          <thead>
            <tr>
              {move && (
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={allChosen}
                    onChange={() => setSelected(allChosen ? new Set() : new Set(rows.map((m) => m.id)))}
                    aria-label="Select every letter on this page"
                  />
                </th>
              )}
              <th>Letter to</th>
              <th>Writer</th>
              <th>{DATE_HEADING[filter]}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <QueueRow key={m.id} m={m} filter={filter} selectable={!!move} selected={selected.has(m.id)} onToggle={() => toggle(m.id)} />
            ))}
          </tbody>
        </table>
      )}
      {pages > 1 && (
        <div className="card-pagination">
          <span>
            Page {page} of {pages} · {list.data?.total} letters
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
  )
}

export default function PrintQueue({ chapterId, keyState }: { chapterId: number; keyState: GroupKeyState }) {
  const [params] = useSearchParams()
  const filter = queueFilter(params.get('filter')).key
  const page = Math.max(1, Number(params.get('page')) || 1)

  return (
    <div className="inbox-section">
      <div className="queue-filters" role="navigation" aria-label="Letters by status">
        {QUEUE_FILTERS.map((f) => (
          <FilterChip key={f.key} to={{ search: `?tab=print&filter=${f.key}` }} active={f.key === filter}>
            {f.label}
          </FilterChip>
        ))}
      </div>
      <QueueList key={`${filter}:${page}`} chapterId={chapterId} filter={filter} page={page} keyState={keyState} />
    </div>
  )
}
