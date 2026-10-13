import { useState } from 'react'
import { Link } from 'react-router-dom'
import { renewInvitation, withdrawInvitation } from '../../api/invitations'
import type { ApiError, Chapter, Invitation, InvitationKind } from '../../types'
import type { UiClasses } from '../forms/uiClasses'
import { date, invitationRefusal, REPLACE_CODE_QUESTION, stateBadge } from './wording'

// The invitations sent, with Renew (PUT /invitation/invitation: a new token,
// the old one stops working) and Withdraw (DELETE) for pending ones (README
// "Invitations"). A site admin sees every invitation; a group admin their own
// group's.

interface Props {
  classes: UiClasses
  invitations: Invitation[]
  groupById: Map<number, Chapter>
  kindLabels: Record<InvitationKind, string>
  /** Where a group's name links: its admin edit page, or its public page. */
  groupHref: (id: number) => string
  onRenewed: (invitation: Invitation) => void
  onChanged: () => void
  /** A code from an earlier create or renew is still on screen: Renew says it replaces it. */
  codeOnScreen?: boolean
}

export default function InvitationTable({ classes: c, invitations, groupById, kindLabels, groupHref, onRenewed, onChanged, codeOnScreen = false }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function act(action: 'renew' | 'withdraw', run: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await run()
    } catch (err) {
      setError(invitationRefusal(err as ApiError, action))
    } finally {
      setBusy(false)
    }
  }

  const groupName = (id: number | null) => (id === null ? null : (groupById.get(id)?.name ?? `group #${id}`))

  return (
    <>
      {error && <div className={`${c.alertErr} ${c.formError}`} role="alert">{error}</div>}
      <table className={c.table}>
        <thead>
          <tr>
            <th>Invitee</th>
            <th>Kind</th>
            <th>Group</th>
            <th>State</th>
            <th>Dates</th>
            <th>
              <span className={c.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((i) => {
            const state = i.state ?? i.status
            return (
              <tr key={i.id}>
                <td>
                  <span className={c.listName}>{i.inviteeName}</span>
                  {i.inviteeEmail && <div className={c.listSub}>{i.inviteeEmail}</div>}
                  {i.note && <div className={c.listSub}>{i.note}</div>}
                </td>
                <td>{kindLabels[i.kind]}</td>
                <td>
                  {i.chapterId !== null ? (
                    <>
                      <span className={c.listSub}>{i.kind === 'group' ? 'Vouched by ' : 'Joining '}</span>
                      <Link to={groupHref(i.chapterId)}>{groupName(i.chapterId)}</Link>
                    </>
                  ) : (
                    <span className={c.listSub}>Invited directly</span>
                  )}
                  {i.createdChapter !== null && (
                    <div>
                      <span className={c.listSub}>Became </span>
                      <Link to={groupHref(i.createdChapter)}>{groupName(i.createdChapter)}</Link>
                    </div>
                  )}
                </td>
                <td>
                  <span className={stateBadge(c, state)}>{state}</span>
                </td>
                <td className={c.nowrap}>
                  <div className={c.listSub}>Sent {date(i.createdAt)}</div>
                  {i.acceptedAt ? (
                    <div className={c.listSub}>Accepted {date(i.acceptedAt)}</div>
                  ) : (
                    i.status === 'pending' && (
                      <div className={state === 'expired' ? `${c.listSub} ${c.stale}` : c.listSub}>
                        {state === 'expired' ? 'Expired' : 'Expires'} {date(i.expiresAt)}
                      </div>
                    )
                  )}
                </td>
                <td className={c.actions}>
                  {i.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        className={c.button}
                        disabled={busy}
                        onClick={() => {
                          const renew = `Renew the invitation for ${i.inviteeName}? You get a new code; the old one stops working.`
                          if (window.confirm(codeOnScreen ? `${REPLACE_CODE_QUESTION}\n\n${renew}` : renew))
                            void act('renew', async () => onRenewed(await renewInvitation(i.id)))
                        }}
                      >
                        Renew
                      </button>
                      <button
                        type="button"
                        className={c.dangerButton}
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Withdraw the invitation for ${i.inviteeName}? Its code stops working.`))
                            void act('withdraw', async () => {
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
