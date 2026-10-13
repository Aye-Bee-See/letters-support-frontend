import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { decideBanRecommendation, getBanRecommendations } from '../../api/admin'
import { useApi } from '../../hooks/useApi'
import { useListParams } from '../../hooks/useListParams'
import type { ApiError, BanRecommendation, BanRecommendationStatus } from '../../types'
import { refusalText } from '../../utils/refusals'

// Site-wide block recommendations (API #172, README "Recommending a site-wide
// block"). A group can block a writer from its own letters; to go further, a
// group admin recommends a site-wide block, and a superadmin decides here.
// Banning gives the writer the banned role: every session ends at once, and it
// settles every group's waiting recommendation for them. The writer is never
// told of a recommendation; the group is told of the decision, with the note.

const STATUSES: { value: BanRecommendationStatus; label: string }[] = [
  { value: 'pending', label: 'Waiting for a decision' },
  { value: 'banned', label: 'Banned' },
  { value: 'dismissed', label: 'Dismissed' },
]
const NOTE_MAX = 500

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const writerName = (r: BanRecommendation) => r.writer?.penName || r.writer?.name || r.writer?.username || `writer #${r.userId}`
const person = (p: { username: string; name: string | null } | null) => (p ? p.name || p.username : 'someone no longer here')
const errorText = (err: unknown) => {
  const e = err as ApiError
  if (e.condition === 'decided') return 'Someone has already decided this one. The list has been refreshed.'
  return e.errors?.length ? e.errors.join(' ') : refusalText(e)
}

export default function BanRecommendations() {
  const { params, update } = useListParams()
  const status = (STATUSES.find((s) => s.value === params.get('status'))?.value ?? 'pending') as BanRecommendationStatus
  const list = useApi(() => getBanRecommendations(status), [status], { keepPrevious: true })
  // Kept here, not in a card: a reload after a decision unmounts the card it came from.
  const [notice, setNotice] = useState<Notice | null>(null)

  // Waiting ones, one card per writer: several groups may recommend the same
  // writer, and a ban settles them all.
  const byWriter = useMemo(() => {
    const groups = new Map<number, BanRecommendation[]>()
    for (const r of list.data ?? []) groups.set(r.userId, [...(groups.get(r.userId) ?? []), r])
    return [...groups.values()]
  }, [list.data])

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Block recommendations</span>
        <span className="topbar-right">{list.data && `${list.data.length} ${status === 'pending' ? 'waiting' : status}`}</span>
      </div>

      <div className="admin-content">
        <p className="form-hint ban-intro">
          A group can stop a writer sending through it. When a group thinks a writer should be stopped everywhere, it recommends a site-wide block
          here. The writer isn’t told about a recommendation. Banning ends every session they have at once, and they can’t sign in again.
        </p>

        <div className="queue-filters">
          <label className="form-label">
            Show
            <select className="form-select" value={status} onChange={(e) => update({ status: e.target.value === 'pending' ? undefined : e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {notice && (
          <div className={notice.kind === 'done' ? 'admin-alert admin-alert-ok' : 'admin-alert admin-alert-warn'} role="status">
            {notice.text}
            <button type="button" className="a-btn a-btn-sm" onClick={() => setNotice(null)}>
              OK
            </button>
          </div>
        )}
        {list.loading && <p className="dash-note">Loading…</p>}
        {list.error && (
          <div className="admin-alert admin-alert-err">
            Couldn't load the recommendations ({refusalText(list.error)}).
            <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
              Try again
            </button>
          </div>
        )}
        {list.data && list.data.length === 0 && (
          <p className="dash-note">{status === 'pending' ? 'No recommendations are waiting.' : `No ${status} recommendations.`}</p>
        )}

        {status === 'pending'
          ? byWriter.map((recs) => (
              <WriterCard
                key={recs[0].userId}
                recs={recs}
                onDecided={(outcome) => {
                  setNotice(outcome)
                  list.reload()
                }}
              />
            ))
          : list.data?.map((r) => <DecidedCard key={r.id} rec={r} />)}
      </div>
    </>
  )
}

/** What the last decision did, or why it didn't happen: the card it came from is gone after the reload. */
type Notice = { kind: 'done' | 'warn'; text: string }

/** One writer, every group's waiting recommendation for them, and the two decisions. */
function WriterCard({ recs, onDecided }: { recs: BanRecommendation[]; onDecided: (outcome: Notice) => void }) {
  const first = recs[0]
  const name = writerName(first)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A dismissal's note goes to that one group; a ban's goes to every group it
  // settles (the API stores the one note on each), so it has its own field.
  const [dismissNotes, setDismissNotes] = useState<Record<number, string>>({})
  const [banNote, setBanNote] = useState('')

  async function decide(r: BanRecommendation, decision: 'ban' | 'dismiss') {
    const question =
      decision === 'ban'
        ? `Ban ${name}? Their account is blocked from the whole site at once: every session they have ends, and they can't sign in again.` +
          (recs.length > 1 ? ` This settles all ${recs.length} groups' recommendations.` : '')
        : `Dismiss ${r.chapter_details?.name ?? 'this group'}'s recommendation? ${name} isn't banned; the group is told.`
    if (!window.confirm(question)) return
    setBusy(true)
    setError(null)
    try {
      const note = (decision === 'ban' ? banNote : dismissNotes[r.id])?.trim() || undefined
      await decideBanRecommendation(r.id, decision, note)
      onDecided({
        kind: 'done',
        text: decision === 'ban' ? `Banned ${name}.` : `Dismissed ${r.chapter_details?.name ?? 'the group'}’s recommendation. ${name} isn’t banned.`,
      })
    } catch (err) {
      // Decided by someone else meanwhile: the list reloads (and this card may go), so the page says it.
      if ((err as ApiError).condition === 'decided') return onDecided({ kind: 'warn', text: errorText(err) })
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <article className="queue-item ban-card">
      <div className="queue-item-header">
        <div>
          <div className="queue-item-title">{name}</div>
          <div className="queue-item-meta">
            {first.writer?.username && first.writer.username !== name && <>{first.writer.username} · </>}
            {recs.length === 1 ? '1 group recommends a site-wide block' : `${recs.length} groups recommend a site-wide block`}
          </div>
        </div>
        <span className="badge badge-draft">waiting</span>
      </div>

      {recs.map((r) => (
        <div key={r.id} className="ban-rec">
          <div className="queue-item-meta">
            {r.chapter_details ? <Link to={`/admin/groups/${r.chapter_details.id}/edit`}>{r.chapter_details.name}</Link> : 'A group no longer here'}
            {' · '}
            {person(r.recommended_by)} · {dateTime(r.createdAt)}
          </div>
          <div className="queue-item-body">{r.reason}</div>
          <div className="ban-rec-actions">
            <input
              className="form-input"
              aria-label={`Note to ${r.chapter_details?.name ?? 'the group'} if you dismiss`}
              placeholder={`If you dismiss: optional note to ${r.chapter_details?.name ?? 'the group'}`}
              maxLength={NOTE_MAX}
              value={dismissNotes[r.id] ?? ''}
              disabled={busy}
              onChange={(e) => setDismissNotes((n) => ({ ...n, [r.id]: e.target.value }))}
            />
            <button type="button" className="a-btn a-btn-sm" disabled={busy} onClick={() => void decide(r, 'dismiss')}>
              Dismiss
            </button>
          </div>
        </div>
      ))}

      {error && <div className="admin-alert admin-alert-err">{error}</div>}
      <div className="ban-rec-actions ban-decision">
        <input
          className="form-input"
          aria-label="Note with the ban"
          placeholder={recs.length > 1 ? `If you ban: optional note to all ${recs.length} groups` : `If you ban: optional note to ${first.chapter_details?.name ?? 'the group'}`}
          maxLength={NOTE_MAX}
          value={banNote}
          disabled={busy}
          onChange={(e) => setBanNote(e.target.value)}
        />
        {/* Any of the writer's recommendations will do: a ban settles them all. */}
        <button type="button" className="a-btn a-btn-danger a-btn-sm" disabled={busy} onClick={() => void decide(first, 'ban')}>
          Ban {name}
        </button>
      </div>
    </article>
  )
}

/** A decided recommendation: who decided, when, how, and the note the group got. */
function DecidedCard({ rec: r }: { rec: BanRecommendation }) {
  return (
    <article className="queue-item queue-decided">
      <div className="queue-item-header">
        <div>
          <div className="queue-item-title">{writerName(r)}</div>
          <div className="queue-item-meta">
            {r.chapter_details?.name ?? 'A group no longer here'} · {person(r.recommended_by)} · {dateTime(r.createdAt)}
          </div>
        </div>
        <span className={`badge ${r.status === 'banned' ? 'badge-pending' : 'badge-published'}`}>{r.status}</span>
      </div>
      <div className="queue-item-body">{r.reason}</div>
      <p className="queue-decision">
        {r.status === 'banned' ? 'Banned' : 'Dismissed'} by {person(r.decided_by)}
        {r.decidedAt && <> on {dateTime(r.decidedAt)}</>}
        {r.decisionNote && <>: “{r.decisionNote}”</>}
      </p>
    </article>
  )
}
