import { useState } from 'react'
import { formatCode } from '../../crypto'
import type { Chapter, Invitation } from '../../types'
import type { UiClasses } from '../forms/uiClasses'
import { dateTime } from '../../utils/dates'

// An invitation's token, once (README "Invitations": it appears in the create
// and renew answers and nowhere else, and the API never sends it): what to hand
// over, how, and until when. Shown until the inviter says they copied it.

interface Props {
  classes: UiClasses
  invitation: Invitation
  renewed: boolean
  /** The group the invitee joins (member) or that vouches (group), for the sentence. */
  group?: Chapter
  onDone: () => void
}

export default function TokenNotice({ classes: c, invitation, renewed, group, onDone }: Props) {
  const [copy, setCopy] = useState<'idle' | 'code' | 'link' | 'failed'>('idle')
  const code = formatCode(invitation.token ?? '')
  // The acceptance page on this site, with the code in it: what most invitees need.
  const link = `${window.location.origin}/invitation?token=${encodeURIComponent(code)}`

  async function copyText(text: string, what: 'code' | 'link') {
    try {
      // Undefined outside a secure context (e.g. the dev server over the LAN), and
      // refused without permission: either way the code on screen still works.
      if (!navigator.clipboard) throw new Error('No clipboard')
      await navigator.clipboard.writeText(text)
      setCopy(what)
    } catch {
      setCopy('failed')
    }
  }
  const what = invitation.kind === 'group' ? `${invitation.inviteeName} to join the network` : `${invitation.inviteeName} to join ${group?.name ?? 'the group'}`

  return (
    <div className={c.tokenNotice} role="status">
      <div>
        <strong>{renewed ? 'Invitation renewed' : 'Invitation created'}</strong> for {what}. This code is shown only now: copy it before closing this
        message.
        {renewed && ' The old code no longer works.'}
      </div>
      <div className={c.tokenRow}>
        <code className={c.tokenCode}>{code}</code>
        <button type="button" className={c.copyButton} onClick={() => void copyText(code, 'code')}>
          {copy === 'code' ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <div className={c.tokenRow}>
        <code className={c.tokenLink}>{link}</code>
        <button type="button" className={c.copyButton} onClick={() => void copyText(link, 'link')}>
          {copy === 'link' ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {copy === 'failed' && (
        <div className={c.alertWarn} role="status">This browser didn’t allow copying. Select the code or link above and copy it by hand, or write it down.</div>
      )}
      <div className={c.hint}>
        Valid until {dateTime(invitation.expiresAt)}. Nothing is sent by email: give it to them in person or through a channel you both already trust.
        The link opens the page where they accept it; with just the code, they can type it in there or in the Android or iOS app.
      </div>
      <div>
        <button type="button" className={c.button} onClick={onDone}>
          I’ve copied it
        </button>
      </div>
    </div>
  )
}
