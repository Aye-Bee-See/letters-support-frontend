import { useState } from 'react'
import { createInvitation } from '../../api/invitations'
import type { ApiError, Chapter, Invitation, InvitationKind } from '../../types'
import { Field } from '../forms/ClassedParts'
import type { UiClasses } from '../forms/uiClasses'
import { invitationRefusal, REPLACE_CODE_QUESTION } from './wording'

// Create an invitation (POST /invitation/invitation, README "Invitations").
// Two callers:
// - a site admin (/admin/invite) names the group: the one vouching for a new
//   group (or nobody), or the one a new group admin joins;
// - a group admin (/settings/invitations) passes `ownGroup`: the API uses the
//   caller's own group, so there is no group to pick.
// The token comes back once, in the answer; the caller shows it (TokenNotice).

interface AdminProps {
  ownGroup?: undefined
  groups: Chapter[] | null
  groupsError: ApiError | null
  onRetryGroups: () => void
}

interface GroupProps {
  /** The signed-in group admin's group: it vouches, or the new group admin joins it. */
  ownGroup: Chapter
}

type Props = (AdminProps | GroupProps) & {
  classes: UiClasses
  onCreated: (invitation: Invitation) => void
  /** A code from an earlier create or renew is still on screen: ask before replacing it. */
  codeOnScreen?: boolean
}

export default function InviteForm(props: Props) {
  const { classes: c, onCreated, ownGroup, codeOnScreen = false } = props
  const admin = ownGroup === undefined ? (props as AdminProps) : null
  // A group adds its own group admins more often than it vouches for a new group.
  const [kind, setKind] = useState<InvitationKind>(ownGroup ? 'member' : 'group')
  const [name, setName] = useState('')
  const [chapter, setChapter] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only an active group can vouch or take members (the API answers 409 otherwise).
  const active = (admin?.groups ?? []).filter((g) => g.accountStatus === 'active')
  const ready = name.trim() !== '' && (kind === 'group' || chapter !== '' || ownGroup !== undefined)

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
      setError(invitationRefusal(err as ApiError, 'create'))
    } finally {
      setBusy(false)
    }
  }

  const kindLabel = (k: InvitationKind) =>
    ownGroup
      ? k === 'group'
        ? 'Vouch for a new group'
        : `A new group admin of ${ownGroup.name}`
      : k === 'group'
        ? 'A new group joins the network'
        : 'A person joins an existing group'

  const nameField = (
    <Field classes={c} label={kind === 'group' ? 'Group name' : 'Person’s name'} htmlFor="i-name" hint="Who is being invited. They can change it when they accept.">
      <input id="i-name" className={c.input} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} required />
    </Field>
  )

  return (
    <form
      className={c.invitePanel}
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready || busy) return
        if (codeOnScreen && !window.confirm(REPLACE_CODE_QUESTION)) return
        void submit()
      }}
    >
      <h2 className={c.heading}>Invite</h2>
      <div className={c.body}>
        <div className={c.kindGroup} role="radiogroup" aria-label="What to invite">
          {(ownGroup ? (['member', 'group'] as const) : (['group', 'member'] as const)).map((k) => (
            <label key={k} className={c.check}>
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
              {kindLabel(k)}
            </label>
          ))}
        </div>
        {admin ? (
          <div className={c.row}>
            {nameField}
            <Field
              classes={c}
              label={kind === 'group' ? 'Vouched for by' : 'Group to join'}
              htmlFor="i-chapter"
              hint={
                kind === 'group'
                  ? 'The group bringing them in. “Nobody” when you invite them directly. Only active groups can vouch.'
                  : 'Required. Only an active group can take new members.'
              }
            >
              <select id="i-chapter" className={c.select} value={chapter} disabled={busy || !admin.groups} onChange={(e) => setChapter(e.target.value)}>
                <option value="">
                  {admin.groupsError ? 'Couldn’t load the groups' : !admin.groups ? 'Loading groups…' : kind === 'group' ? 'Nobody' : 'Choose a group…'}
                </option>
                {active.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {admin.groupsError && (
                <span className={`${c.hint} ${c.stale}`}>
                  Couldn’t load the groups ({admin.groupsError.message}).{' '}
                  <button type="button" className={c.linkButton} onClick={admin.onRetryGroups}>
                    Try again
                  </button>
                </span>
              )}
            </Field>
          </div>
        ) : (
          nameField
        )}
        <div className={c.row}>
          <Field classes={c} label="Their email" htmlFor="i-email" hint="Optional, for your own records. Nothing is sent to it.">
            <input id="i-email" type="email" className={c.input} value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field classes={c} label="Note" htmlFor="i-note" hint="Optional and private: why they're being invited, who knows them.">
            <input id="i-note" className={c.input} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        {kind === 'group' && !ownGroup && (
          <p className={c.hint}>
            A new group starts pending: its first account can sign in, but the group can’t act and isn’t listed until a superadmin approves it on the
            Groups page.
          </p>
        )}
        {kind === 'group' && ownGroup && (
          <p className={c.hint}>
            {ownGroup.name} vouches for them, and the new group’s record says so for good. It starts pending: its first account can sign in, but the group
            can’t act and isn’t in the directory until a site admin approves it. Vouch only for a group you know.
          </p>
        )}
        {kind === 'member' && ownGroup && (
          // group-admin-plan.md section 3: any screen that leads to handing out the group key says this.
          <div className={c.alertWarn}>
            <strong>A group admin can be handed the group key, and the group key reads every letter {ownGroup.name} mails.</strong> Invite only people
            your group trusts with that, and keep the group small: each one is another person who could be pressured or lose a device.
          </div>
        )}
        {error && <div className={c.alertErr}>{error}</div>}
      </div>
      <div className={c.footer}>
        <span />
        <button type="submit" className={c.primaryButton} disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create invitation'}
        </button>
      </div>
    </form>
  )
}
