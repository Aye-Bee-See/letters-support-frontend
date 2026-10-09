import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../api/client'
import { getMessages, setLetterStatusBatch } from '../../api/letters'
import { useApi } from '../../hooks/useApi'
import type { GroupKeyState } from '../../hooks/useGroup'
import { usePageClamp } from '../../hooks/useListParams'
import type { DeclineReason, Message, Prison } from '../../types'
import {
  batchDeclineRules,
  declineText,
  EMPTY_QUEUE,
  heldReasonShort,
  heldReasonText,
  lettersNamed,
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
import { DeclineForm } from './DeclineLetter'

// The group's print queue (group-admin-plan.md, WP1 "To print"). Rows come from
// GET /messaging/messages?relayChapter=&status=&held=&full=true (README "GET
// /messaging/messages"): full=true adds the prisoner, their facility and the
// writer, so a page of the queue needs no request per letter and nothing here is
// decrypted. Marking goes through PUT /messaging/status/batch, all or none
// (README "PUT /messaging/status/batch"); a held letter is printed only with
// `release: true`, after the group admin confirms (README "Moved and freed").
// "Don't send" declines the selected letters the same way (README "Declined
// letters"): queued, held or printed, held ones without `release`. "Print
// selected" opens the chosen queued or held letters on one batch sheet
// (pages/inbox/PrintBatch.tsx), held ones after the same confirmation, and the
// sheet marks them printed together.
//
// Each filter chip carries its count: the API has no counts endpoint, so it is
// one page_size=1 request per chip (its `total`), six small requests when the
// queue opens and again after a batch action here. Nothing polls.

const PAGE_SIZE = 50

type Notice = { kind: 'error' | 'done'; text: string }

/** What a filter's selected letters can be marked as, if anything. These filters' letters can be declined too; mailed and later can't. */
const BATCH_MOVE: Partial<Record<QueueFilter, { target: 'printed' | 'mailed'; label: string; release?: true }>> = {
  queued: { target: 'printed', label: 'Mark printed' },
  held: { target: 'printed', label: 'Mark printed', release: true },
  printed: { target: 'mailed', label: 'Mark mailed' },
}

/** How many letters each filter holds, from one page_size=1 request per filter; `refresh` reads them again. */
function useQueueCounts(chapterId: number): { counts: Partial<Record<QueueFilter, number>>; refresh: () => void } {
  const [version, setVersion] = useState(0)
  const [counts, setCounts] = useState<Partial<Record<QueueFilter, number>>>({})
  useEffect(() => {
    let live = true
    for (const f of QUEUE_FILTERS) {
      getMessages({ relayChapter: chapterId, status: f.status, held: f.held, page: 1, page_size: 1 })
        .then((r) => live && setCounts((c) => ({ ...c, [f.key]: r.total })))
        // A count that can't be read is left off the chip; the list says why if it can't load either.
        .catch(() => live && setCounts((c) => ({ ...c, [f.key]: undefined })))
    }
    return () => {
      live = false
    }
  }, [chapterId, version])
  return { counts, refresh: () => setVersion((v) => v + 1) }
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
  refused,
  onToggle,
}: {
  m: Message
  filter: QueueFilter
  selectable: boolean
  selected: boolean
  refused: boolean
  onToggle: () => void
}) {
  const prisoner = m.prisoner_details
  const prison = (prisoner?.prison_details ?? null) as Prison | null
  const held = heldReasonShort(m.heldReason)
  return (
    <tr className={['queue-row', selected && 'is-selected', refused && 'is-refused'].filter(Boolean).join(' ')}>
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

/**
 * One filter's page of letters, with selection and the batch move. Keyed on the
 * filter and page, so both reset. Moving the last letters off a later page goes
 * back to the last page there is, carrying the notice of what was done.
 */
function QueueList({
  chapterId,
  filter,
  page,
  keyState,
  carried,
  onClamp,
  onChanged,
}: {
  chapterId: number
  filter: QueueFilter
  page: number
  keyState: GroupKeyState
  /** The notice from the page this list was moved back from. */
  carried: Notice | null
  onClamp: (last: number, notice: Notice | null) => void
  /** Letters moved: the chips' counts are read again. */
  onChanged: () => void
}) {
  const [, setParams] = useSearchParams()
  const navigate = useNavigate()
  const spec = queueFilter(filter)
  const list = useApi(
    () => getMessages({ relayChapter: chapterId, status: spec.status, held: spec.held, full: true, page, page_size: PAGE_SIZE }),
    [chapterId, filter, page],
  )
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Which held-letter question is open: before marking them printed, or before opening them on the batch sheet.
  const [confirming, setConfirming] = useState<false | 'mark' | 'print'>(false)
  const [declining, setDeclining] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(carried)
  // The letters the last refusal named, from its `ids` (README "PUT /messaging/status/batch"), marked in the list.
  const [refused, setRefused] = useState<Set<number>>(new Set())

  const move = BATCH_MOVE[filter]
  const rows = list.data?.items ?? []
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1
  usePageClamp(page, list.data ? pages : null, (last) => onClamp(last, notice))
  // Printing needs the letters open; marking mailed only needs them on paper already.
  const canMove = !!move && (move.target === 'mailed' || keyState === 'ready')
  const chosenRows = rows.filter((m) => selected.has(m.id))
  const chosen = chosenRows.map((m) => m.id)
  const declineRules = batchDeclineRules(chosenRows)
  // Deselecting every letter closes the form; selecting again opens it where it was.
  const showDecline = declining && chosen.length > 0

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allChosen = rows.length > 0 && chosen.length === rows.length

  /** The batch sheet, in the queue's order; `release` names the held letters confirmed here. */
  const printSelected = (confirmedHeld: boolean) => {
    const ids = chosen.join(',')
    navigate(`/letters/print-batch?ids=${ids}${confirmedHeld ? `&release=${ids}` : ''}`)
  }

  async function run() {
    if (!move || chosen.length === 0) return
    setBusy(true)
    setNotice(null)
    setRefused(new Set())
    try {
      const done = await setLetterStatusBatch(chosen, { status: move.target, ...(move.release ? { release: true } : {}) })
      setNotice({ kind: 'done', text: `${done.count === 1 ? '1 letter' : `${done.count} letters`} marked ${move.target}.` })
      setSelected(new Set())
      setConfirming(false)
      list.reload()
      onChanged()
    } catch (err) {
      const apiError = toApiError(err)
      setNotice({ kind: 'error', text: statusRefusal(apiError, chosen, move.target) })
      setRefused(new Set(lettersNamed(apiError, chosen)))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  async function decline(reason: DeclineReason, rule: string | null, note: string): Promise<string | null> {
    if (chosen.length === 0) return 'Select the letters not to send.'
    setRefused(new Set())
    try {
      const done = await setLetterStatusBatch(chosen, { status: 'declined', reason, ...(rule ? { rule } : {}), ...(note ? { note } : {}) })
      setNotice({
        kind: 'done',
        text: `${done.count === 1 ? '1 letter' : `${done.count} letters`} not sent. ${done.count === 1 ? 'The writer is' : 'Each writer is'} told why, and may write it again.`,
      })
      setSelected(new Set())
      setDeclining(false)
      list.reload()
      onChanged()
      return null
    } catch (err) {
      const apiError = toApiError(err)
      // A rule some letter's facility doesn't carry (any more) is `not_eligible` on `rule`, naming the letters.
      setRefused(new Set(lettersNamed(apiError, chosen)))
      return statusRefusal(apiError, chosen, 'declined')
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
                  setRefused(new Set())
                  setNotice(null)
                  list.reload()
                  onChanged()
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
          {!confirming && !showDecline && (
            <>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!canMove || chosen.length === 0 || busy}
                onClick={() => (move.release ? setConfirming('mark') : run())}
              >
                {busy ? 'Marking…' : move.label}
              </button>
              {move.target === 'printed' && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={keyState !== 'ready' || chosen.length === 0 || busy}
                  onClick={() => (move.release ? setConfirming('print') : printSelected(false))}
                >
                  Print selected
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm"
                disabled={chosen.length === 0 || busy}
                onClick={() => {
                  setNotice(null)
                  setDeclining(true)
                }}
              >
                Don’t send
              </button>
            </>
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
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => (confirming === 'print' ? printSelected(true) : void run())}>
            {busy ? 'Marking…' : 'Yes, print anyway'}
          </button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}

      {showDecline && (
        <DeclineForm
          rules={declineRules.rules}
          noRulesWhy={declineRules.why}
          count={chosen.length}
          onDecline={decline}
          onCancel={() => setDeclining(false)}
        />
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
              <QueueRow key={m.id} m={m} filter={filter} selectable={!!move} selected={selected.has(m.id)}
                refused={refused.has(m.id)}
                onToggle={() => toggle(m.id)} />
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
  const [params, setParams] = useSearchParams()
  const filter = queueFilter(params.get('filter')).key
  const page = Math.max(1, Number(params.get('page')) || 1)
  const at = `${filter}:${page}`
  const { counts, refresh } = useQueueCounts(chapterId)
  // A notice carried to the page a list was moved back to; dropped once the list is elsewhere.
  const [carried, setCarried] = useState<{ from: string; at: string; notice: Notice } | null>(null)
  if (carried && at !== carried.at && at !== carried.from) setCarried(null)

  const clamp = (last: number, notice: Notice | null) => {
    if (notice) setCarried({ from: at, at: `${filter}:${last}`, notice })
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (last > 1) next.set('page', String(last))
        else next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="inbox-section">
      <div className="queue-filters" role="navigation" aria-label="Letters by status">
        {QUEUE_FILTERS.map((f) => (
          <FilterChip key={f.key} to={{ search: `?tab=print&filter=${f.key}` }} active={f.key === filter}>
            {counts[f.key] === undefined ? f.label : `${f.label} (${counts[f.key]})`}
          </FilterChip>
        ))}
      </div>
      <QueueList
        key={at}
        chapterId={chapterId}
        filter={filter}
        page={page}
        keyState={keyState}
        carried={carried?.at === at ? carried.notice : null}
        onClamp={clamp}
        onChanged={refresh}
      />
    </div>
  )
}
