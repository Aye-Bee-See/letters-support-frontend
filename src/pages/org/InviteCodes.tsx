import qrcode from 'qrcode-generator'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cancelInviteCodes, getInviteCodes, issueInviteCodes } from '../../api/inviteCodes'
import { formatCode } from '../../crypto'
import { useApi } from '../../hooks/useApi'
import { useGroup } from '../../hooks/useGroup'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import type { ApiError, InviteCodeBatch, InviteCodeSummary, IssuedInviteCodes } from '../../types'

// Invite codes (README "Invite codes"): the group issues a batch, prints the
// codes as slips and hands them out; a newcomer joins with one at /join
// (pages/auth/Join.tsx) and the account is theirs from the start, sponsored by
// the group for good. The answer to POST /auth/invite-codes is the only time
// the codes exist anywhere but on the slips, so they are shown once, here,
// until the group admin says they printed or copied them. The group sees counts
// only: never who used a code.
//
// QR codes are fine on these slips: they stay outside prisons
// (group-admin-plan.md section 3). Nothing printed for a letter has one.
//
// Classes: pages/org-settings.css (the settings page's, plus the slips and
// their print layout).

/** README "POST /auth/invite-codes": count 1 to 50, label up to 80, days 1 to INVITE_CODE_DAYS (30 unless the server says less). */
const MAX_COUNT = 50
const MAX_LABEL = 80
const MAX_DAYS = 30

const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The page /join reads the code from (Join.tsx: `?code=`, checked straight away). */
const joinLink = (code: string) => `${window.location.origin}/join?code=${encodeURIComponent(code)}`

export default function InviteCodes() {
  const { group } = useGroup()
  const summary = useApi(() => getInviteCodes(), [])
  // The batch just issued: its codes, shown until the group admin clears them.
  const [issued, setIssued] = useState<IssuedInviteCodes | null>(null)
  const [preview, setPreview] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const groupName = group?.name ?? 'Your group'

  // Leaving with the codes on screen loses them for good, by a link in the app as much as by closing the tab: ask first.
  useLeaveGuard(issued !== null, 'The invite codes on this page are shown only now. Leave without copying or printing them?')

  return (
    <div className="settings-wrap">
      <div className="settings-inner settings-inner-wide">
        <div className="invite-screen">
          <Link to="/settings" className="settings-back">
            ← Group settings
          </Link>
          <h1 className="settings-title">Invite codes</h1>
          <p className="settings-subtitle">
            Print a batch of codes as slips and hand them out at a letter night, or to anyone your group vouches for. Each code makes one writer’s
            account, and the account is theirs alone from the start.
          </p>

          {issued && (
            <IssuedPanel
              issued={issued}
              preview={preview}
              onPreview={setPreview}
              onDone={() => {
                if (!window.confirm('Clear these codes from the screen? They can’t be shown again: only the printed or copied ones will work.')) return
                setIssued(null)
                setPreview(false)
              }}
            />
          )}
        </div>

        {issued && <Slips issued={issued} groupName={groupName} preview={preview} />}

        <div className="invite-screen">
          {!issued && (
            <IssueForm
              summary={summary.data}
              onIssued={(batch) => {
                setNotice(null)
                setIssued(batch)
                summary.reload()
              }}
              onStale={summary.reload}
            />
          )}

          <section className="settings-section">
            <h2 className="settings-section-heading">Batches</h2>
            {notice && (
              <div className="settings-alert settings-alert-ok settings-alert-block" role="status">
                {notice}
              </div>
            )}
            {summary.loading && <p className="settings-static">Loading your group’s batches…</p>}
            {summary.error && (
              <div className="settings-alert settings-alert-err">
                Couldn’t load your group’s invite codes ({summary.error.message}).{' '}
                <button type="button" className="settings-link-button" onClick={summary.reload}>
                  Try again
                </button>
              </div>
            )}
            {summary.data && (
              <Batches
                summary={summary.data}
                onCancelled={(text) => {
                  setNotice(text)
                  summary.reload()
                }}
              />
            )}
            <p className="settings-hint" style={{ marginTop: '1rem' }}>
              Codes never travel by email from this site: print them or copy them, and hand them over yourselves. Your group sees only these counts,
              never who used a code, and can’t list the accounts made with them.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

/** Issue a batch: POST /auth/invite-codes. */
function IssueForm({
  summary,
  onIssued,
  onStale,
}: {
  summary: InviteCodeSummary | null
  onIssued: (batch: IssuedInviteCodes) => void
  /** The counts shown were out of date (another group admin issued meanwhile). */
  onStale: () => void
}) {
  const [count, setCount] = useState('10')
  const [label, setLabel] = useState('')
  const [days, setDays] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = Number(count)
  const room = summary ? Math.max(0, summary.limit - summary.outstanding) : null
  const issues: string[] = []
  if (!/^\d+$/.test(count.trim()) || n < 1 || n > MAX_COUNT) issues.push(`How many: a whole number from 1 to ${MAX_COUNT}.`)
  if (label.trim().length > MAX_LABEL) issues.push(`The label can be at most ${MAX_LABEL} characters.`)
  if (days.trim() && !(/^\d+$/.test(days.trim()) && Number(days) >= 1 && Number(days) <= MAX_DAYS)) issues.push(`Days: a whole number from 1 to ${MAX_DAYS}, or leave it empty.`)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const batch = await issueInviteCodes({
        count: n,
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(days.trim() ? { days: Number(days) } : {}),
      })
      setLabel('')
      setDays('')
      onIssued(batch)
    } catch (err) {
      setError(await issueRefusal(err as ApiError, n))
      if ((err as ApiError).status === 409) onStale()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="settings-section"
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy && issues.length === 0) void submit()
      }}
    >
      <h2 className="settings-section-heading">Issue a batch</h2>
      <div className="settings-form">
        {summary && (
          <p className="invite-quota">
            <strong>{summary.outstanding}</strong> of {summary.limit} unused codes out now.{' '}
            {room === 0
              ? 'That’s the most your group may have at once: cancel unused ones below, or wait for some to be used or to expire.'
              : `You can issue up to ${room} more. A used code frees its place at once.`}
          </p>
        )}
        <div className="settings-row">
          <div className="settings-field">
            <label className="settings-label" htmlFor="ic-count">
              How many
            </label>
            <input id="ic-count" className="settings-input" inputMode="numeric" value={count} disabled={busy} onChange={(e) => setCount(e.target.value)} />
            <span className="settings-hint">1 to {MAX_COUNT}.</span>
          </div>
          <div className="settings-field">
            <label className="settings-label" htmlFor="ic-days">
              Days they work <span className="settings-label-optional">optional</span>
            </label>
            <input id="ic-days" className="settings-input" inputMode="numeric" placeholder={String(MAX_DAYS)} value={days} disabled={busy} onChange={(e) => setDays(e.target.value)} />
            <span className="settings-hint">A shorter life for codes that should end with the event they’re for. Up to {MAX_DAYS}.</span>
          </div>
        </div>
        <div className="settings-field">
          <label className="settings-label" htmlFor="ic-label">
            Label <span className="settings-label-optional">optional</span>
          </label>
          <input
            id="ic-label"
            className="settings-input"
            maxLength={MAX_LABEL}
            placeholder="Letter night, 2 October"
            value={label}
            disabled={busy}
            onChange={(e) => setLabel(e.target.value)}
          />
          <span className="settings-hint">Shown in the batch list so you know which slips these were. Not printed.</span>
        </div>
        {issues.length > 0 && (
          <div className="settings-alert settings-alert-warn">
            {issues.map((text) => (
              <div key={text}>{text}</div>
            ))}
          </div>
        )}
        {room !== null && issues.length === 0 && n > room && (
          <div className="settings-alert settings-alert-warn">
            A batch of {n} would put your group over its limit of {summary?.limit} unused codes. Issue {room === 0 ? 'none until some are used, cancelled or expired' : `${room} or fewer`}.
          </div>
        )}
        {error && <div className="settings-alert settings-alert-err">{error}</div>}
      </div>
      <div className="settings-save-row">
        <button type="submit" className="settings-save-btn" disabled={busy || issues.length > 0 || (room !== null && n > room)}>
          {busy ? 'Issuing…' : `Issue ${plural(Number.isFinite(n) && n > 0 ? n : 0, 'code')}`}
        </button>
        <span className="settings-hint">The codes are shown once, on the next screen.</span>
      </div>
    </form>
  )
}

/** Why issuing was refused, from status and name (README "Invite codes"). */
async function issueRefusal(err: ApiError, count: number): Promise<string> {
  if (err.status === 409 && err.name === 'InviteQuotaError') {
    // The numbers, fresh: another group admin may have issued meanwhile.
    try {
      const now = await getInviteCodes()
      const room = Math.max(0, now.limit - now.outstanding)
      return `Your group already has ${now.outstanding} unused codes and may have at most ${now.limit} at once, so a batch of ${count} would go over. ${
        room > 0 ? `Issue ${room} or fewer, or cancel unused codes below.` : 'Cancel unused codes below, or wait for some to be used or to expire.'
      }`
    } catch {
      return `A batch of ${count} would put your group over its limit of unused codes. Cancel unused codes below, or issue fewer.`
    }
  }
  if (err.status === 403) return 'Only a group admin of an active group can issue invite codes, and only for their own group.'
  if (err.status === 400) return err.errors.length ? err.errors.join(' ') : 'Check how many, the label and the days.'
  return err.message
}

/** The codes, once, with copy, the slips and the "done" step. */
function IssuedPanel({
  issued,
  preview,
  onPreview,
  onDone,
}: {
  issued: IssuedInviteCodes
  preview: boolean
  onPreview: (on: boolean) => void
  onDone: () => void
}) {
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle')
  const codes = issued.codes.map((c) => formatCode(c))

  async function copyAll() {
    try {
      // Undefined outside a secure context, and refused without permission: the codes on screen still work.
      if (!navigator.clipboard) throw new Error('No clipboard')
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopy('done')
    } catch {
      setCopy('failed')
    }
  }

  return (
    <section className="settings-section" data-leave-guard-ok>
      <h2 className="settings-section-heading">
        {plural(codes.length, 'new code')}
        {issued.label ? `: ${issued.label}` : ''}
      </h2>
      <div className="settings-form">
        <div className="settings-alert settings-alert-warn" role="status">
          <strong>These codes are shown only now.</strong> Print the slips or copy the codes before you clear them from the screen: the site keeps
          only a scrambled form and can’t show them again. They work until {date(issued.expiresAt)}, once each.
        </div>
        <p className="invite-quota">
          Your group now has <strong>{issued.outstanding}</strong> of {issued.limit} unused codes out.
        </p>
        <ul className="invite-codes-list" aria-label="The new codes">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {copy === 'failed' && (
          <div className="settings-alert settings-alert-warn">This browser didn’t allow copying. Select the codes above and copy them by hand, or print the slips.</div>
        )}
        <div className="settings-add-row">
          <button type="button" className="settings-btn" onClick={() => window.print()}>
            Print slips
          </button>
          <button type="button" className="settings-btn" onClick={() => onPreview(!preview)}>
            {preview ? 'Hide the slips' : 'Show the slips'}
          </button>
          <button type="button" className="settings-btn" onClick={() => void copyAll()}>
            {copy === 'done' ? 'Copied' : 'Copy all codes'}
          </button>
        </div>
        <p className="settings-hint">
          Each slip has your group’s name, the code, the link to join with it and a QR code of that link, and the date it stops working. Cut along the
          dashed lines. Hand them over in person: nothing is sent by email.
        </p>
      </div>
      <div className="settings-save-row">
        <button type="button" className="settings-save-btn" onClick={onDone}>
          I’ve printed or copied them
        </button>
      </div>
    </section>
  )
}

/** One slip per code: what prints (and the on-screen preview). */
function Slips({ issued, groupName, preview }: { issued: IssuedInviteCodes; groupName: string; preview: boolean }) {
  const slips = useMemo(
    () =>
      issued.codes.map((raw) => {
        const code = formatCode(raw)
        const link = joinLink(code)
        const qr = qrcode(0, 'M')
        qr.addData(link)
        qr.make()
        return { code, link, svg: qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true }) }
      }),
    [issued.codes],
  )
  const until = date(issued.expiresAt)

  return (
    <div className={preview ? 'invite-slips is-preview' : 'invite-slips'} aria-hidden={!preview}>
      {slips.map((s) => (
        <div key={s.code} className="invite-slip">
          <div className="invite-slip-group">{groupName}</div>
          <div className="invite-slip-what">
            An invitation to write to people in prison through letters.support. Open the link or scan the QR code, then choose a username and password:
            the account is yours alone.
          </div>
          <div className="invite-slip-code">{s.code}</div>
          <div className="invite-slip-link">{s.link}</div>
          <div className="invite-slip-until">Valid until {until}. Works once.</div>
          {/* The library's own SVG markup, built from the join link above. */}
          <div className="invite-slip-qr" role="img" aria-label={`QR code of the link for ${s.code}`} dangerouslySetInnerHTML={{ __html: s.svg }} />
        </div>
      ))}
    </div>
  )
}

/** The group's batches with counts, and cancelling: GET and DELETE /auth/invite-codes. */
function Batches({ summary, onCancelled }: { summary: InviteCodeSummary; onCancelled: (text: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel(which: { batch: string } | { all: true }, question: string) {
    if (!window.confirm(question)) return
    setBusy(true)
    setError(null)
    try {
      const answer = await cancelInviteCodes(which)
      onCancelled(
        answer.cancelled === 0
          ? 'There were no unused codes left to cancel.'
          : `Cancelled ${plural(answer.cancelled, 'code')}. Your group now has ${answer.outstanding} unused.`,
      )
    } catch (err) {
      const e = err as ApiError
      setError(e.status === 403 ? 'Only a group admin of an active group can cancel its codes.' : e.status === 400 ? 'Choose a batch to cancel.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  const name = (b: InviteCodeBatch) => b.label ?? `Batch of ${date(b.createdAt)}`

  return (
    <>
      {summary.outstanding > 0 && (
        <p style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className="settings-btn settings-btn-danger"
            disabled={busy}
            onClick={() =>
              void cancel(
                { all: true },
                `Cancel all ${summary.outstanding} unused codes of every batch? Slips already handed out stop working. Accounts made with used codes stay.`,
              )
            }
          >
            Cancel all {summary.outstanding} unused
          </button>
        </p>
      )}
      {error && <div className="settings-alert settings-alert-err settings-alert-block">{error}</div>}
      {summary.batches.length === 0 ? (
        <p className="settings-static">No codes issued yet.</p>
      ) : (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Created</th>
                <th>Expires</th>
                <th className="num">Total</th>
                <th className="num">Used</th>
                <th className="num">Unused</th>
                <th className="num">Cancelled</th>
                <th className="num">Expired</th>
                <th>
                  <span className="settings-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.batches.map((b) => (
                <tr key={b.batch}>
                  <td>{name(b)}</td>
                  <td className="settings-nowrap">{date(b.createdAt)}</td>
                  <td className={new Date(b.expiresAt) < new Date() ? 'settings-nowrap settings-stale' : 'settings-nowrap'}>{date(b.expiresAt)}</td>
                  <td className="num">{b.total}</td>
                  <td className="num">{b.used}</td>
                  <td className="num">{b.unused}</td>
                  <td className="num">{b.cancelled}</td>
                  <td className="num">{b.expired}</td>
                  <td className="settings-actions">
                    {b.unused > 0 && (
                      <button
                        type="button"
                        className="settings-btn settings-btn-danger"
                        disabled={busy}
                        onClick={() =>
                          void cancel(
                            { batch: b.batch },
                            `Cancel the ${plural(b.unused, 'unused code')} of “${name(b)}”? Those slips stop working. Accounts made with its used codes stay.`,
                          )
                        }
                      >
                        Cancel batch
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
