import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getAdminSummary, getAuditLog, getEncryptionReadiness } from '../../api/admin'
import { getSubmissions } from '../../api/corrections'
import { useApi, type ApiState } from '../../hooks/useApi'
import type { AccountBrief, AdminSummary, AuditEntry, EncryptionReadiness, Submission, SubmissionResource } from '../../types'
import { refusalText } from '../../utils/refusals'

// Built on GET /moderation/summary, /auth/encryption-readiness, /moderation/submissions
// and /moderation/audit. Each panel loads on its own, so one failing request
// leaves the rest of the dashboard usable.

const RESOURCE_LABELS: Record<SubmissionResource, string> = { prisoner: 'Prisoner', prison: 'Facility', chapter: 'Group' }
const RESOURCE_LINKS: Record<SubmissionResource, string> = { prisoner: '/admin/prisoners', prison: '/admin/facilities', chapter: '/admin/groups' }
const RESOURCES: SubmissionResource[] = ['prisoner', 'prison', 'chapter']
/** A backup older than this is reported as overdue. */
const BACKUP_OVERDUE_HOURS = 48

const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0)

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const who = (account: AccountBrief | null | undefined) => (account ? account.name || account.username : 'System')

export default function Dashboard() {
  const summary = useApi(getAdminSummary, [])
  const readiness = useApi(getEncryptionReadiness, [])
  // The API has no sort for submissions: they always come oldest first, the
  // queue order (Submission.list in the API), so the first page is the oldest five.
  const queue = useApi(() => getSubmissions({ status: 'pending', page_size: 5 }), [])
  const audit = useApi(() => getAuditLog({ page_size: 10 }), [])

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Dashboard</span>
        <span className="topbar-right">
          <button type="button" className="a-btn a-btn-sm" onClick={() => [summary, readiness, queue, audit].forEach((s) => s.reload())}>
            Refresh
          </button>
        </span>
      </div>

      <div className="admin-content">
        <Alerts summary={summary.data} readiness={readiness.data} />

        <Panel state={summary} what="the summary">
          {summary.data && <Stats summary={summary.data} />}
        </Panel>

        <div className="dash-grid">
          <section className="admin-table-wrap">
            <div className="admin-table-toolbar">
              <span className="admin-table-toolbar-title">Waiting for review</span>
              <Link to="/admin/queue" className="a-btn a-btn-sm">Open queue</Link>
            </div>
            <Panel state={queue} what="the queue">
              {queue.data && <QueueTable items={queue.data.items} total={queue.data.total} />}
            </Panel>
          </section>

          <section className="admin-table-wrap">
            <div className="admin-table-toolbar">
              <span className="admin-table-toolbar-title">Directory</span>
            </div>
            <Panel state={summary} what="the directory counts">
              {summary.data && <DirectoryTable summary={summary.data} />}
            </Panel>
          </section>

          <section className="admin-table-wrap">
            <div className="admin-table-toolbar">
              <span className="admin-table-toolbar-title">Encryption and sign-in</span>
            </div>
            <Panel state={readiness} what="encryption readiness">
              {readiness.data && <EncryptionTable readiness={readiness.data} />}
            </Panel>
          </section>

          <section className="admin-table-wrap">
            <div className="admin-table-toolbar">
              <span className="admin-table-toolbar-title">Recent activity</span>
              <Link to="/admin/audit" className="a-btn a-btn-sm">Open audit log</Link>
            </div>
            <Panel state={audit} what="the audit log">
              {audit.data && <ActivityTable entries={audit.data.items} />}
            </Panel>
          </section>
        </div>
      </div>
    </>
  )
}

/** Loading and error lines inside a panel; the children once loaded. */
function Panel({ state, what, children }: { state: ApiState<unknown>; what: string; children: ReactNode }) {
  if (state.loading) return <p className="dash-note">Loading {what}…</p>
  if (state.error)
    return (
      <p className="dash-note">
        Couldn't load {what} ({refusalText(state.error)}).{' '}
        <button type="button" className="a-btn a-btn-sm" onClick={state.reload}>
          Try again
        </button>
      </p>
    )
  return <>{children}</>
}

/** Things that need a superadmin's attention, worst first. Nothing shown while loading. */
function Alerts({ summary, readiness }: { summary: AdminSummary | null; readiness: EncryptionReadiness | null }) {
  const errors: ReactNode[] = []
  const warnings: ReactNode[] = []

  if (readiness) {
    // The API's `blockers` are worded for a server-mode deployment planning the
    // switch; in e2e mode the same groups can't receive letters now.
    for (const g of readiness.groups.withoutKey.filter((g) => g.blocksTheSwitch))
      errors.push(
        readiness.mode === 'e2e'
          ? `${g.name} relays mail but has no group key, so no letters can be sent through it.`
          : `${g.name} relays mail but has no group key: after the switch to end-to-end encryption, no letters could be sent through it.`,
      )
    // The server key matters while the server seals letters (server mode) or still
    // holds some for readers without keys; after the migration's final clean-up
    // removes it in e2e mode, its absence is the expected state.
    if (!readiness.serverKeyConfigured && (readiness.mode !== 'e2e' || readiness.letters.serverHeld > 0))
      warnings.push('No server encryption key is configured: letters cannot be sealed to readers who set up keys later.')
    if (readiness.authSchemes.plain > 0)
      warnings.push(
        `${readiness.authSchemes.plain} account${readiness.authSchemes.plain === 1 ? '' : 's'} still sign${readiness.authSchemes.plain === 1 ? 's' : ''} in by sending a password, and cannot use the web client.`,
      )
  }

  if (summary) {
    const { backups } = summary
    if (!backups.configured) errors.push('Backups are not configured (BACKUP_PUBLIC_KEY is not set), so none are being made.')
    else if (!backups.newest) errors.push('Backups are configured, but none has been made yet.')
    else if (backups.ageHours !== null && backups.ageHours > BACKUP_OVERDUE_HOURS)
      warnings.push(`The newest backup is ${Math.round(backups.ageHours)} hours old.`)
  }

  if (errors.length === 0 && warnings.length === 0) {
    if (!summary || !readiness) return null
    return <div className="admin-alert admin-alert-ok">Nothing needs attention: backups are current and encryption is ready.</div>
  }

  return (
    <>
      {errors.map((text, i) => (
        <div key={`e${i}`} className="admin-alert admin-alert-err">{text}</div>
      ))}
      {warnings.map((text, i) => (
        <div key={`w${i}`} className="admin-alert admin-alert-warn">{text}</div>
      ))}
    </>
  )
}

function Stats({ summary }: { summary: AdminSummary }) {
  const pending = sum(summary.pendingSubmissions)
  const cards: { label: string; value: number; to?: string }[] = [
    { label: 'Proposals to review', value: pending, to: '/admin/queue' },
    { label: 'Groups awaiting approval', value: summary.groups.pendingApproval, to: '/admin/groups?accountStatus=pending' },
    { label: 'Block recommendations', value: summary.pendingBanRecommendations, to: '/admin/bans' },
    { label: 'Addresses in doubt', value: summary.addressInDoubt.prisoner, to: '/admin/prisoners?addressInDoubt=true' },
    // The summary's staleVerification matches the lists' stale=true filter (README "GET /moderation/summary").
    { label: 'Prisoners to re-verify', value: summary.staleVerification.prisoner, to: '/admin/prisoners?stale=true' },
    { label: 'Facilities to re-verify', value: summary.staleVerification.prison, to: '/admin/facilities?stale=true' },
    { label: 'Suspended groups', value: summary.groups.suspended, to: '/admin/groups?accountStatus=suspended' },
  ]
  return (
    <div className="admin-stats dash-stats">
      {cards.map((card) => {
        const body = (
          <>
            <div className="admin-stat-number">{card.value.toLocaleString()}</div>
            <div className="admin-stat-label">{card.label}</div>
          </>
        )
        const className = `admin-stat-card${card.value > 0 && card.label !== 'Suspended groups' ? ' alert' : ''}`
        return card.to ? (
          <Link key={card.label} to={card.to} className={`${className} dash-stat-link`}>
            {body}
          </Link>
        ) : (
          <div key={card.label} className={className}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

function QueueTable({ items, total }: { items: Submission[]; total: number }) {
  if (items.length === 0) return <p className="dash-note">No proposals are waiting.</p>
  return (
    <>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Proposal</th>
            <th>From</th>
            <th>Filed</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td>
                {/* A change opens the record's admin edit page; a new record is read whole in the queue. */}
                {s.kind === 'update' && s.targetId !== null ? (
                  <Link to={`${RESOURCE_LINKS[s.resource]}/${s.targetId}/edit`}>
                    Change to {RESOURCE_LABELS[s.resource].toLowerCase()} #{s.targetId}
                  </Link>
                ) : (
                  <Link to={`/admin/queue?resource=${s.resource}`}>New {RESOURCE_LABELS[s.resource].toLowerCase()}</Link>
                )}
              </td>
              <td>{who(s.submitter)}</td>
              <td>{dateTime(s.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > items.length && (
        <p className="dash-note">
          Oldest {items.length} of {total}. <Link to="/admin/queue">See them all</Link>
        </p>
      )}
    </>
  )
}

function DirectoryTable({ summary }: { summary: AdminSummary }) {
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Records</th>
          <th>Published</th>
          <th>Pending</th>
          <th>Draft</th>
        </tr>
      </thead>
      <tbody>
        {RESOURCES.map((r) => {
          const counts = summary.records[r]
          return (
            <tr key={r}>
              <td>
                <Link to={RESOURCE_LINKS[r]}>{RESOURCE_LABELS[r] === 'Facility' ? 'Facilities' : `${RESOURCE_LABELS[r]}s`}</Link>
              </td>
              <td>{counts.published}</td>
              <td>{counts.pending > 0 ? <span className="badge badge-pending">{counts.pending}</span> : 0}</td>
              <td>{counts.draft > 0 ? <span className="badge badge-draft">{counts.draft}</span> : 0}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Named groups, each linked to its edit page, with what is said of each. */
function GroupLinks({ groups }: { groups: { id: number; name: string; detail: string }[] }) {
  if (groups.length === 0) return <>None</>
  return (
    <>
      {groups.map((g) => (
        <div key={g.id}>
          <Link to={`/admin/groups/${g.id}/edit`}>{g.name}</Link> <span className="list-sub">{g.detail}</span>
        </div>
      ))}
    </>
  )
}

const keyHolders = (g: { members: number; membersWithKeys: number }) =>
  `${g.membersWithKeys} of ${g.members} group admin${g.members === 1 ? '' : 's'} with keys`

function EncryptionTable({ readiness }: { readiness: EncryptionReadiness }) {
  const { groups, writers, letters, authSchemes } = readiness
  const rows: [string, ReactNode][] = [
    ['Mode', readiness.mode === 'e2e' ? 'End-to-end' : 'Server'],
    ['Groups with a group key', `${groups.withKey} of ${groups.active} active`],
    [
      'Groups without a group key',
      <GroupLinks
        groups={groups.withoutKey.map((g) => ({
          id: g.id,
          name: g.name,
          detail: `${keyHolders(g)}${g.blocksTheSwitch ? '; relays mail' : ''}`,
        }))}
      />,
    ],
    [
      'Group admins waiting for their group key',
      <GroupLinks groups={groups.membersWaitingForGroupKey.map((g) => ({ id: g.id, name: g.name, detail: keyHolders(g) }))} />,
    ],
    ['Writers with keys', `${writers.withKeys} of ${writers.total}`],
    ['Writers without keys who have letters', writers.withoutKeysWithLetters.toLocaleString()],
    [
      'Groups whose unclaimed writers have no keys',
      <GroupLinks
        groups={groups.unclaimedWritersWithoutKeys.map((g) => ({ id: g.id, name: g.name, detail: `${g.writers} writer${g.writers === 1 ? '' : 's'}` }))}
      />,
    ],
    ['Letters held for readers without keys', letters.serverHeld.toLocaleString()],
    ['… waiting for a writer to set up keys', letters.waitingForWriters.toLocaleString()],
    ['… waiting for a group to set up its key', letters.waitingForGroups.toLocaleString()],
    ['Accounts signing in without sending a password', `${authSchemes.split} of ${authSchemes.split + authSchemes.plain}`],
  ]
  return (
    <table className="admin-table">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ActivityTable({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="dash-note">Nothing has been recorded yet.</p>
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>When</th>
          <th>Who</th>
          <th>What</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td className="dash-nowrap">{dateTime(e.createdAt)}</td>
            <td>{who(e.actor_details)}</td>
            <td>
              <code className="dash-code">{e.action}</code>
              {e.targetId !== null && <> #{e.targetId}</>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
