import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllGroups } from '../../api/groups'
import { createInvitation, getInvitations, renewInvitation, withdrawInvitation } from '../../api/invitations'
import { Field } from '../../components/forms/AdminFormParts'
import ListPager from '../../components/ui/ListPager'
import { formatCode } from '../../crypto'
import { useApi } from '../../hooks/useApi'
import { useListParams } from '../../hooks/useListParams'
import type { ApiError, Chapter, Invitation, InvitationKind, InvitationStatus } from '../../types'

// Inviting groups (and members of groups) into the network: POST, GET, PUT
// (renew) and DELETE (withdraw) /invitation. Groups aren't registered; a group
// that joins is vouched for by the group named here, or by nobody when a
// superadmin invites it directly. The token appears once, in the answer to
// create or renew. The API never sends it: the admin hands it over.
//
// The website can't accept an invitation yet; the Android and iOS apps can.

const PAGE_SIZE = 25
const STATUSES: InvitationStatus[] = ['pending', 'accepted', 'revoked']
const KIND_LABELS: Record<InvitationKind, string> = { group: 'New group', member: 'Group member' }
const STATE_BADGES: Record<NonNullable<Invitation['state']>, string> = {
  pending: 'badge-draft',
  expired: 'badge-pending',
  accepted: 'badge-published',
  revoked: 'badge-pending',
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const oneOf = <T extends string>(values: readonly T[], v: string | null): T | undefined =>
  values.includes(v as T) ? (v as T) : undefined

export default function Invitations() {
  const { params, page, update } = useListParams()
  const status = oneOf(STATUSES, params.get('status'))
  const kind = oneOf(['group', 'member'] as const, params.get('kind'))

  const list = useApi(() => getInvitations({ status, kind, page, page_size: PAGE_SIZE }), [status, kind, page])
  const groups = useApi(() => getAllGroups({ sort: 'name' }), [])
  const groupById = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g])), [groups.data])
  // The token to hand over, after a create or renew: shown until dismissed.
  const [issued, setIssued] = useState<{ invitation: Invitation; renewed: boolean } | null>(null)

  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">Invitations</span>
      </div>

      <div className="admin-content">
        {issued && <TokenNotice {...issued} group={issued.invitation.chapterId ? groupById.get(issued.invitation.chapterId) : undefined} onDone={() => setIssued(null)} />}

        <InviteForm
          groups={groups.data}
          onCreated={(invitation) => {
            setIssued({ invitation, renewed: false })
            list.reload()
          }}
        />

        <div className="admin-table-toolbar list-toolbar invite-list-toolbar">
          <span className="admin-table-toolbar-title">Invitations sent</span>
          <select className="form-select" aria-label="Status" value={status ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'pending' ? 'Pending (including expired)' : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select className="form-select" aria-label="Kind" value={kind ?? ''} onChange={(e) => update({ kind: e.target.value || undefined })}>
            <option value="">Groups and members</option>
            <option value="group">New groups</option>
            <option value="member">Group members</option>
          </select>
        </div>
        <div className="admin-table-wrap">
          {list.loading && <p className="dash-note">Loading invitations…</p>}
          {list.error && (
            <p className="dash-note">
              Couldn't load invitations ({list.error.message}).{' '}
              <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
                Try again
              </button>
            </p>
          )}
          {list.data && list.data.total === 0 && <p className="dash-note">{status || kind ? 'No invitations match.' : 'No invitations yet.'}</p>}
          {list.data && list.data.items.length > 0 && (
            <InvitationTable
              invitations={list.data.items}
              groupById={groupById}
              onRenewed={(invitation) => {
                setIssued({ invitation, renewed: true })
                list.reload()
              }}
              onChanged={list.reload}
            />
          )}
        </div>
        {list.data && <ListPager page={page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />}
      </div>
    </>
  )
}

function InviteForm({ groups, onCreated }: { groups: Chapter[] | null; onCreated: (invitation: Invitation) => void }) {
  const [kind, setKind] = useState<InvitationKind>('group')
  const [name, setName] = useState('')
  const [chapter, setChapter] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only an active group can vouch or take members (the API answers 409 otherwise).
  const active = (groups ?? []).filter((g) => g.accountStatus === 'active')
  const ready = name.trim() !== '' && (kind === 'group' || chapter !== '')

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const invitation = await createInvitation({
        kind,
        inviteeName: name.trim(),
        ...(chapter ? { chapter: Number(chapter) } : {}),
        ...(email.trim() ? { inviteeEmail: email.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      setName('')
      setEmail('')
      setNote('')
      setChapter('')
      onCreated(invitation)
    } catch (err) {
      const e = err as ApiError
      setError(e.errors?.length ? e.errors.join(' ') : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="admin-form invite-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready && !busy) void submit()
      }}
    >
      <h2 className="admin-form-header">Invite</h2>
      <div className="admin-form-body">
        <div className="invite-kind" role="radiogroup" aria-label="What to invite">
          {(['group', 'member'] as const).map((k) => (
            <label key={k} className="queue-check">
              <input
                type="radio"
                name="kind"
                checked={kind === k}
                disabled={busy}
                onChange={() => {
                  setKind(k)
                  setChapter('')
                }}
              />
              {k === 'group' ? 'A new group joins the network' : 'A person joins an existing group'}
            </label>
          ))}
        </div>
        <div className="form-row">
          <Field label={kind === 'group' ? 'Group name' : 'Person’s name'} htmlFor="i-name" hint="Who is being invited. They can change it when they accept.">
            <input id="i-name" className="form-input" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field
            label={kind === 'group' ? 'Vouched for by' : 'Group to join'}
            htmlFor="i-chapter"
            hint={
              kind === 'group'
                ? 'The group bringing them in. “Nobody” when you invite them directly. Only active groups can vouch.'
                : 'Required. Only an active group can take new members.'
            }
          >
            <select id="i-chapter" className="form-select" value={chapter} disabled={busy || !groups} onChange={(e) => setChapter(e.target.value)}>
              <option value="">{!groups ? 'Loading groups…' : kind === 'group' ? 'Nobody' : 'Choose a group…'}</option>
              {active.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Their email" htmlFor="i-email" hint="Optional, for your own records. Nothing is sent to it.">
            <input id="i-email" type="email" className="form-input" value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Note" htmlFor="i-note" hint="Optional and private: why they're being invited, who knows them.">
            <input id="i-note" className="form-input" value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        {kind === 'group' && (
          <p className="form-hint">
            A new group starts pending: its first account can sign in, but the group can’t act and isn’t listed until a superadmin approves it on the
            Groups page.
          </p>
        )}
        {error && <div className="admin-alert admin-alert-err">{error}</div>}
      </div>
      <div className="admin-form-footer">
        <span />
        <button type="submit" className="a-btn a-btn-primary" disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create invitation'}
        </button>
      </div>
    </form>
  )
}

/** The token, once: what to hand over, how, and until when. */
function TokenNotice({ invitation, renewed, group, onDone }: { invitation: Invitation; renewed: boolean; group?: Chapter; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const code = formatCode(invitation.token ?? '')
  const what = invitation.kind === 'group' ? `${invitation.inviteeName} to join the network` : `${invitation.inviteeName} to join ${group?.name ?? 'the group'}`

  return (
    <div className="admin-alert admin-alert-ok token-notice" role="status">
      <div>
        <strong>{renewed ? 'Invitation renewed' : 'Invitation created'}</strong> for {what}. This code is shown only now: copy it before closing this
        message.
        {renewed && ' The old code no longer works.'}
      </div>
      <div className="token-row">
        <code className="token-code">{code}</code>
        <button
          type="button"
          className="a-btn a-btn-sm"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopied(true))
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="form-hint">
        Valid until {dateTime(invitation.expiresAt)}. Nothing is sent by email: give it to them in person or through a channel you both already trust.
        They accept it in the letters.support app for Android or iOS (the website can’t accept invitations yet).
      </div>
      <div>
        <button type="button" className="a-btn a-btn-sm" onClick={onDone}>
          I’ve copied it
        </button>
      </div>
    </div>
  )
}

interface TableProps {
  invitations: Invitation[]
  groupById: Map<number, Chapter>
  onRenewed: (invitation: Invitation) => void
  onChanged: () => void
}

function InvitationTable({ invitations, groupById, onRenewed, onChanged }: TableProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function act(run: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await run()
    } catch (err) {
      setError((err as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  const groupName = (id: number | null) => (id === null ? null : (groupById.get(id)?.name ?? `group #${id}`))

  return (
    <>
      {error && <div className="admin-alert admin-alert-err form-error">{error}</div>}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Invitee</th>
            <th>Kind</th>
            <th>Group</th>
            <th>State</th>
            <th>Dates</th>
            <th>
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((i) => {
            const state = i.state ?? i.status
            return (
              <tr key={i.id}>
                <td>
                  <span className="list-name">{i.inviteeName}</span>
                  {i.inviteeEmail && <div className="list-sub">{i.inviteeEmail}</div>}
                  {i.note && <div className="list-sub">{i.note}</div>}
                </td>
                <td>{KIND_LABELS[i.kind]}</td>
                <td>
                  {i.chapterId !== null ? (
                    <>
                      <span className="list-sub">{i.kind === 'group' ? 'Vouched by ' : 'Joining '}</span>
                      <Link to={`/admin/groups/${i.chapterId}/edit`}>{groupName(i.chapterId)}</Link>
                    </>
                  ) : (
                    <span className="list-sub">Invited directly</span>
                  )}
                  {i.createdChapter !== null && (
                    <div>
                      <span className="list-sub">Became </span>
                      <Link to={`/admin/groups/${i.createdChapter}/edit`}>{groupName(i.createdChapter)}</Link>
                    </div>
                  )}
                </td>
                <td>
                  <span className={`badge ${STATE_BADGES[state]}`}>{state}</span>
                </td>
                <td className="dash-nowrap">
                  <div className="list-sub">Sent {date(i.createdAt)}</div>
                  {i.acceptedAt ? (
                    <div className="list-sub">Accepted {date(i.acceptedAt)}</div>
                  ) : (
                    i.status === 'pending' && <div className={`list-sub${state === 'expired' ? ' list-stale' : ''}`}>{state === 'expired' ? 'Expired' : 'Expires'} {date(i.expiresAt)}</div>
                  )}
                </td>
                <td className="actions">
                  {i.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        className="a-btn a-btn-sm"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Renew the invitation for ${i.inviteeName}? You get a new code; the old one stops working.`))
                            void act(async () => onRenewed(await renewInvitation(i.id)))
                        }}
                      >
                        Renew
                      </button>
                      <button
                        type="button"
                        className="a-btn a-btn-danger a-btn-sm"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Withdraw the invitation for ${i.inviteeName}? Its code stops working.`))
                            void act(async () => {
                              await withdrawInvitation(i.id)
                              onChanged()
                            })
                        }}
                      >
                        Withdraw
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
