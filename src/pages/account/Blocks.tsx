import { Link } from 'react-router-dom'
import { getMyBlocks } from '../../api/auth'
import LoadState from '../../components/ui/LoadState'
import { useApi } from '../../hooks/useApi'
import { longDate } from '../../utils/dates'

// Groups not mailing the writer's letters (README "Blocking a writer", GET
// /auth/blocks): the group, the reason it gave and when. Only what the writer
// was told, never who blocked them. Markup from the claim page's classes
// (pages/claim.css), as the other account pages use; the list is Blocked
// writers' (pages/blocked-writers.css).

export default function Blocks() {
  const blocks = useApi(getMyBlocks, [])
  return (
    <div className="claim-page">
      <title>Groups not mailing your letters · letters.support</title>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        <div className="claim-box">
          <div className="claim-state is-active">
            <div className="claim-header">
              <h1 className="claim-title">Groups not mailing your letters</h1>
              <p className="claim-org-note">
                A group can stop printing and mailing your letters. It affects that group only: every other group still mails them, and
                you can choose another one when you write. The group decides when to lift it. While it stands, your letters waiting in that
                group’s queue are on hold.
              </p>
            </div>
            <div className="claim-body">
              <LoadState state={blocks} what="the groups not mailing your letters" />
              {blocks.data && blocks.data.length === 0 && <p className="block-empty">Every group is mailing your letters.</p>}
              {blocks.data && blocks.data.length > 0 && (
                <ul className="block-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {blocks.data.map((b) => (
                    <li key={b.chapter.id} className="block-item">
                      <div className="block-item-head">
                        <span className="block-item-name">
                          {b.chapter.name ? <Link to={`/groups/${b.chapter.id}`}>{b.chapter.name}</Link> : 'A group no longer in the directory'}
                        </span>
                        <span className="block-item-meta">Since {longDate(b.blockedAt)}</span>
                      </div>
                      <div className="block-item-reason">{b.reason}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <Link to="/inbox" className="claim-back">
          ← Back
        </Link>
      </div>
    </div>
  )
}

/**
 * A line for the writer's inbox when at least one group isn't mailing their
 * letters, linking to the page above. Nothing otherwise, or if it can't load.
 */
export function BlocksNotice() {
  const blocks = useApi(getMyBlocks, [])
  const list = blocks.data ?? []
  if (list.length === 0) return null
  return (
    <p className="sidebar-info" style={{ marginBottom: '1.25rem' }}>
      <strong>
        {list.length === 1 ? `${list[0].chapter.name ?? 'A group'} isn’t mailing your letters.` : `${list.length} groups aren’t mailing your letters.`}
      </strong>{' '}
      <Link to="/account/blocks">See why</Link>.
    </p>
  )
}
