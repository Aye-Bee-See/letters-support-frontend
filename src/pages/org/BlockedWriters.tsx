import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getGroupBlocks, unblockWriter } from '../../api/groups'
import { getBanRecommendations } from '../../api/moderation'
import LoadState from '../../components/ui/LoadState'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import type { ApiError, BanRecommendation, BanRecommendationStatus, GroupBlock } from '../../types'
import { blockRefusal, letterCount, longDate, personLabel } from '../../utils/blocks'
import { writerLabel } from '../../utils/groupLetters'
import '../../assets/styles/pages/blocked-writers.css'

// The group's blocked writers and its site-wide block recommendations (web
// issue #9).
// - README "Blocking a writer": GET /chapter/blocks lists the group's blocks
//   (writer, reason, blockedBy, blockedAt); DELETE /chapter/block lifts one and
//   answers how many held letters were `released` back into the queue.
// - README "Recommending a site-wide block": GET /moderation/ban-recommendations
//   gives a group admin their own group's in every state (no `status` needed),
//   each with the site admin's `decisionNote` once decided.
// Blocking and recommending start from the writer's conversation
// (components/group/WriterBlockActions), where the writer is known.

const STATE_LABEL: Record<BanRecommendationStatus, string> = {
  pending: 'Waiting',
  banned: 'Blocked site-wide',
  dismissed: 'Dismissed',
}

export default function BlockedWriters() {
  const blocks = useApi(() => getGroupBlocks(), [])
  const recommendations = useApi(() => getBanRecommendations(), [])
  // Kept here, not on the row: the row goes away when the list reloads.
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <div className="settings-wrap">
      <div className="settings-inner">
        <Link to="/settings" className="settings-back">
          ← Group settings
        </Link>
        <h1 className="settings-title">Blocked writers</h1>
        <p className="settings-subtitle">Writers your group won’t mail letters for, and the site-wide blocks your group has asked for.</p>

        <section className="settings-section">
          <h2 className="settings-section-heading">Blocked from your group</h2>
          {notice && (
            <p className="block-notice" role="status" style={{ marginBottom: '1rem' }}>
              {notice}
            </p>
          )}
          {!blocks.data && <LoadState state={blocks} what="your group’s blocked writers" />}
          {blocks.data && blocks.data.length === 0 && (
            <div className="block-empty">
              <p>Your group hasn’t blocked anyone.</p>
              <p>
                Blocking a writer stops them sending letters through your group, and only your group: they can still write through any
                other. Their letters already waiting in your queue are held until you unblock them, decline them, or print one on
                purpose. The writer is told, with your reason. To block someone, open one of their conversations and use Block from our
                group under Writer.
              </p>
            </div>
          )}
          {blocks.data && blocks.data.length > 0 && (
            <div className="block-list">
              {blocks.data.map((b) => (
                <BlockRow
                  key={b.writer?.id ?? b.blockedAt}
                  block={b}
                  onUnblocked={(message) => {
                    setNotice(message)
                    blocks.reload()
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section className="settings-section">
          <h2 className="settings-section-heading">Site-wide block recommendations</h2>
          {!recommendations.data && <LoadState state={recommendations} what="your group’s recommendations" />}
          {recommendations.data && recommendations.data.length === 0 && (
            <div className="block-empty">
              <p>Your group hasn’t recommended a site-wide block.</p>
              <p>
                A block from your group reaches your group only. When a writer should be stopped everywhere, a group admin recommends a
                site-wide block, with a reason only site admins read; the writer is not told. A site admin decides, and what they decided,
                with their note, shows here. Recommend one from the writer’s conversation, under Writer.
              </p>
            </div>
          )}
          {recommendations.data && recommendations.data.length > 0 && (
            <div className="block-list">
              {recommendations.data.map((r) => (
                <RecommendationRow key={r.id} rec={r} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** One block: the writer, the reason they were told, who blocked them and when, and Unblock with a confirmation. */
function BlockRow({ block, onUnblocked }: { block: GroupBlock; onUnblocked: (message: string) => void }) {
  const { user } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = writerLabel(block.writer, 'A writer whose account is gone')
  const writerId = block.writer?.id

  async function unblock() {
    if (writerId === undefined) return
    setBusy(true)
    setError(null)
    try {
      const { released } = await unblockWriter(writerId)
      onUnblocked(
        released > 0
          ? `${name} is unblocked. ${letterCount(released)} went back into the queue.`
          : `${name} is unblocked. None of their letters was being held.`,
      )
    } catch (err) {
      const e = err as ApiError
      // Unblocked by someone else meanwhile: the reload shows it.
      if (e.status === 404) return onUnblocked(blockRefusal(e, 'unblock'))
      setError(blockRefusal(e, 'unblock'))
      setBusy(false)
    }
  }

  return (
    <article className="block-item">
      <div className="block-item-head">
        <span className="block-item-name">
          {name}
          {block.writer?.penName && block.writer.name && <small>{block.writer.name}</small>}
        </span>
        <span className="block-item-meta">
          Blocked by {personLabel(block.blockedBy, user?.id)} on {longDate(block.blockedAt)}
        </span>
      </div>
      <div className="block-item-meta">The reason the writer was told:</div>
      <div className="block-item-reason">{block.reason}</div>
      {error && (
        <p className="block-error" role="alert">
          {error}
        </p>
      )}
      {writerId !== undefined && (
        <div className="block-item-actions">
          {!confirming ? (
            <button type="button" className="block-btn" onClick={() => setConfirming(true)}>
              Unblock
            </button>
          ) : (
            <>
              <span>
                Unblock {name}? They can write through your group again, their held letters go back into the queue, and they are told.
              </span>
              <button type="button" className="block-btn block-btn-primary" disabled={busy} onClick={() => void unblock()}>
                {busy ? 'Unblocking…' : 'Yes, unblock'}
              </button>
              <button type="button" className="block-btn" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </article>
  )
}

/** One recommendation: the writer, the group's reason, its state, and the site admin's decision and note. */
function RecommendationRow({ rec: r }: { rec: BanRecommendation }) {
  const { user } = useAuth()
  const name = writerLabel(r.writer, 'A writer whose account is gone')
  return (
    <article className="block-item">
      <div className="block-item-head">
        <span className="block-item-name">
          {name}
          {r.writer?.penName && r.writer.name && <small>{r.writer.name}</small>}
        </span>
        <span className={`block-state block-state-${r.status}`}>{STATE_LABEL[r.status] ?? r.status}</span>
      </div>
      <div className="block-item-meta">
        Recommended by {personLabel(r.recommended_by, user?.id)} on {longDate(r.createdAt)}. Your group’s reason, which only site admins
        read:
      </div>
      <div className="block-item-reason">{r.reason}</div>
      {r.status === 'pending' ? (
        <div className="block-item-meta">Waiting for a site admin to decide.</div>
      ) : (
        <div className="block-item-decision">
          {r.decided_by ? `A site admin (${r.decided_by.name || r.decided_by.username})` : 'A site admin'}
          {r.status === 'banned' ? ' blocked them from the whole site' : ' dismissed it'}
          {r.decidedAt && ` on ${longDate(r.decidedAt)}`}.
          {r.decisionNote ? (
            <>
              {' '}
              Their note: “{r.decisionNote}”
            </>
          ) : (
            ' They left no note.'
          )}
        </div>
      )}
    </article>
  )
}
