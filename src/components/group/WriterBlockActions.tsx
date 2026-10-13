import { useState, type SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { blockWriter, getGroupBlocks, unblockWriter } from '../../api/groups'
import { getBanRecommendations, recommendBan } from '../../api/moderation'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { ApiError } from '../../types'
import {
  BLOCK_REASON_MAX,
  RECOMMEND_REASON_MAX,
  blockOf,
  blockRefusal,
  canActOn,
  letterCount,
  longDate,
  personLabel,
  type BlockableWriter,
} from '../../utils/blocks'
import { writerInSentence } from '../../utils/groupLetters'
import '../../assets/styles/pages/blocked-writers.css'

// A group admin's two ways to deal with a writer who is misusing the system
// (web issue #9):
// - Block from our group: README "Blocking a writer" (POST/DELETE /chapter/block,
//   GET /chapter/blocks). It reaches this group only. The reason is shown to the
//   writer and to every group admin of the group. Their letters waiting in the
//   queue are held (`writer_blocked`) until the group unblocks, declines, or
//   prints one on purpose.
// - Recommend a site-wide block: README "Recommending a site-wide block"
//   (POST /moderation/ban-recommendation). Only a site admin reads the reason;
//   the writer is not told. One waiting recommendation per group and writer.
// A block or unblock calls `onChanged` with the notice it shows, so the page can
// reload what the block changed (the Thread's held letters); the page hands the
// notice back as `initialNotice` when this remounts after that reload.
// Renders nothing for anyone but a real writer: not a writer this group looks
// after, not an anonymous writer, not a group admin or a site admin.

type Form = 'block' | 'recommend' | 'unblock' | null

export default function WriterBlockActions({
  writer,
  initialNotice = null,
  onChanged,
}: {
  writer: BlockableWriter
  initialNotice?: string | null
  onChanged?: (notice: string) => void
}) {
  const { user } = useAuth()
  const chapterId = user?.role === 'chapter' ? user.chapterId : null
  const allowed = canActOn(writer, chapterId)

  const blocks = useApi(() => (allowed ? getGroupBlocks() : Promise.resolve(null)), [allowed, writer.id])
  // Only the waiting ones matter here: a decided one either banned the writer
  // (then this renders nothing) or was dismissed (then the group may ask again).
  const recommendations = useApi(() => (allowed ? getBanRecommendations('pending') : Promise.resolve(null)), [allowed, writer.id])

  const [form, setForm] = useState<Form>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(initialNotice)

  if (!allowed) return null
  // Quiet until we know whether the group has blocked them; a failure says so.
  if (blocks.loading && !notice) return null

  const name = writerInSentence(writer)
  const block = blockOf(blocks.data, writer.id)
  const waiting = recommendations.data?.find((r) => r.userId === writer.id) ?? null

  function open(next: Form) {
    setForm(next)
    setReason('')
    setError(null)
    setNotice(null)
  }

  async function run(action: () => Promise<string>, refusalFor: 'block' | 'unblock' | 'recommend') {
    setBusy(true)
    setError(null)
    try {
      const message = await action()
      setNotice(message)
      setForm(null)
      setReason('')
      blocks.reload()
      recommendations.reload()
      // A recommendation changes nothing in the queue; a block or unblock does.
      if (refusalFor !== 'recommend') onChanged?.(message)
    } catch (err) {
      const e = err as ApiError
      setError(blockRefusal(e, refusalFor))
      // Someone else got there first: show how things stand now, and close the
      // form when there is nothing left to send (a recommendation already waiting).
      if (e.status === 404 || e.status === 409) {
        if (e.status === 409) setForm(null)
        blocks.reload()
        recommendations.reload()
      }
    } finally {
      setBusy(false)
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault()
    const words = reason.trim()
    const max = form === 'block' ? BLOCK_REASON_MAX : RECOMMEND_REASON_MAX
    if (!words) return setError('Write a reason first: it is required.')
    if (words.length > max) return setError(`The reason can be at most ${max} characters; this one has ${words.length}.`)
    if (form === 'block')
      void run(async () => {
        const { held } = await blockWriter(writer.id, words)
        return held > 0
          ? `Blocked from your group. ${letterCount(held)} of theirs waiting in your queue ${held === 1 ? 'is' : 'are'} held now.`
          : 'Blocked from your group. None of their letters was waiting in your queue.'
      }, 'block')
    else
      void run(async () => {
        await recommendBan(writer.id, words)
        return 'Recommendation sent. A site admin will decide it; the outcome and their note show on Blocked writers.'
      }, 'recommend')
  }

  function unblock() {
    void run(async () => {
      const { released } = await unblockWriter(writer.id)
      return released > 0
        ? `Unblocked. ${letterCount(released)} went back into the queue.`
        : 'Unblocked. No letters of theirs were being held.'
    }, 'unblock')
  }

  const max = form === 'block' ? BLOCK_REASON_MAX : RECOMMEND_REASON_MAX
  const length = reason.trim().length

  return (
    <div className="block-actions">
      {blocks.error && <p className="block-error">Couldn’t check whether your group has blocked {name}.</p>}

      {block && (
        <div className="block-status">
          <strong>Blocked by your group since {longDate(block.blockedAt)}</strong> ({personLabel(block.blockedBy, user?.id)}). The reason
          they were told: “{block.reason}”
        </div>
      )}
      {waiting && (
        <div className="block-status block-status-quiet">
          Your group recommended a site-wide block on {longDate(waiting.createdAt)}. It is waiting for a site admin.
        </div>
      )}

      {notice && <p className="block-notice" role="status">{notice}</p>}
      {error && form === null && <p className="block-error" role="alert">{error}</p>}

      {form === null && (
        <div className="block-actions-buttons">
          {block ? (
            <button type="button" className="block-btn" onClick={() => open('unblock')}>
              Unblock
            </button>
          ) : (
            !blocks.error && (
              <button type="button" className="block-btn block-btn-danger" onClick={() => open('block')}>
                Block from our group
              </button>
            )
          )}
          {!waiting && (
            <button type="button" className="block-btn" onClick={() => open('recommend')}>
              Recommend a site-wide block
            </button>
          )}
        </div>
      )}

      {form === 'unblock' && (
        <div className="block-form">
          <div className="block-form-title">Unblock {name}?</div>
          <p className="settings-hint">
            They can send letters through your group again, and their letters held in your queue go back into it as they were.
            They are told.
          </p>
          {error && <p className="block-error" role="alert">{error}</p>}
          <div className="block-actions-buttons">
            <button type="button" className="block-btn block-btn-primary" disabled={busy} onClick={unblock}>
              {busy ? 'Unblocking…' : 'Unblock'}
            </button>
            <button type="button" className="block-btn" disabled={busy} onClick={() => open(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {(form === 'block' || form === 'recommend') && (
        <form className="block-form" onSubmit={submit}>
          <label className="block-form-title" htmlFor="block-reason">
            {form === 'block' ? `Block ${name} from your group` : `Recommend blocking ${name} from the whole site`}
          </label>
          {form === 'block' ? (
            <p className="settings-hint">
              They can’t send letters through your group while the block stands; other groups can still mail their letters. Their
              letters waiting in your queue are held until you unblock them, decline them, or print one on purpose.
            </p>
          ) : (
            <p className="settings-hint">
              A site admin decides. A site-wide block ends every session the writer has and stops them writing through any group.
            </p>
          )}
          <textarea
            id="block-reason"
            className="settings-textarea"
            value={reason}
            maxLength={max + 200}
            disabled={busy}
            required
            onChange={(e) => setReason(e.target.value)}
          />
          {/* As NoteField says of a return or decline note: who reads it, that it is not encrypted, and not to quote a letter. */}
          {form === 'block' ? (
            <p className="settings-hint">
              The writer reads this reason, and so does every admin of your group, and it is <strong>not encrypted</strong>: say why, and
              don’t quote their letters.
            </p>
          ) : (
            <p className="settings-hint">
              Only a site admin reads this; the writer is not told. It is <strong>not encrypted</strong>, and a site admin never reads a
              letter: say what happened, and don’t quote any letter.
            </p>
          )}
          <span className={`block-form-count${length > max ? ' is-over' : ''}`}>
            {length} / {max}
          </span>
          {error && <p className="block-error" role="alert">{error}</p>}
          <div className="block-actions-buttons">
            <button type="submit" className={`block-btn ${form === 'block' ? 'block-btn-danger' : 'block-btn-primary'}`} disabled={busy}>
              {busy ? 'Sending…' : form === 'block' ? 'Block from our group' : 'Recommend a site-wide block'}
            </button>
            <button type="button" className="block-btn" disabled={busy} onClick={() => open(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <Link className="block-more" to="/blocked-writers">
        Blocked writers and recommendations
      </Link>
    </div>
  )
}
