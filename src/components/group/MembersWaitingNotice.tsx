import { useState } from 'react'
import { getMemberKeys } from '../../api/groups'
import { adminName, errorText, EVERY_HOLDER, handKeyTo, isStaleKey } from '../../groups/keys'
import { useGroupKeyRefresh } from '../../groups/useGroupKeyRefresh'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useGroup } from '../../hooks/useGroup'

// "N group admins are waiting for the key", with one button that hands it to
// all of them after one confirmation, as the apps ask (README "Group keys": the
// owner hands the key out; GET /auth/member-keys says who is `waiting`). Shown
// to the group-owner admin only, while the group key is open in this session.
// Self-contained, so the inbox can mount it as well as the keys page.

interface Props {
  /** Called after the key was handed to someone, so the page around it can reload its own list. */
  onHanded?: () => void
  /** Change it to make the notice read the roster again (the page around it read its own again). */
  reloadKey?: number
}

export default function MembersWaitingNotice({ onHanded, reloadKey = 0 }: Props) {
  const { groupKeypair } = useAuth()
  const group = useGroup()
  const refreshKey = useGroupKeyRefresh()
  const chapter = group.chapterId
  const canHand = chapter !== null && group.isActive && group.isOwner && group.keyState === 'ready'
  const roster = useApi(() => (canHand ? getMemberKeys(chapter) : Promise.resolve(null)), [canHand, chapter, reloadKey])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const waiting = (roster.data?.members ?? []).filter((m) => roster.data?.waiting.includes(m.id) && m.publicKey)

  async function handToAll() {
    if (!groupKeypair || chapter === null) return
    const names = waiting.map(adminName).join(', ')
    if (
      !window.confirm(
        `Hand the group key to ${names}?\n\n${EVERY_HOLDER}`,
      )
    )
      return
    setBusy(true)
    setNote(null)
    const handed: string[] = []
    const failed: string[] = []
    try {
      for (const m of waiting) {
        try {
          await handKeyTo(chapter, { id: m.id, publicKey: m.publicKey as string }, groupKeypair, group.keyVersion)
          handed.push(adminName(m))
        } catch (err) {
          if (isStaleKey(err)) {
            // Rotated meanwhile: what this session holds is the old key. Fetch the new one; nothing more is sealed with the old.
            await refreshKey().catch(() => null)
            failed.push('the group key changed meanwhile (it was rotated), so nobody else was handed the old one; try again')
            break
          }
          failed.push(`${adminName(m)}: ${errorText(err)}`)
        }
      }
      const parts = [
        handed.length > 0 ? `Handed the key to ${handed.join(', ')}.` : '',
        failed.length > 0 ? `Not handed: ${failed.join('; ')}.` : '',
      ]
      setNote({ ok: failed.length === 0, text: parts.filter(Boolean).join(' ') })
    } finally {
      setBusy(false)
      roster.reload()
      if (handed.length > 0) onHanded?.()
    }
  }

  if (!canHand || (waiting.length === 0 && !note)) return null

  return (
    <div className="stale-banner" role="status">
      <span className="stale-banner-icon">{note?.ok ? '✓' : '⚠'}</span>
      <span className="stale-banner-text">
        {note && <>{note.text} </>}
        {waiting.length > 0 && (
          <>
            <strong>
              {waiting.length === 1 ? `${adminName(waiting[0])} is waiting for the key.` : `${waiting.length} group admins are waiting for the key.`}
            </strong>{' '}
            They have keys of their own, and can't read the group's letters until you hand it to them.{' '}
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !groupKeypair} onClick={() => void handToAll()}>
              {busy ? 'Handing it over…' : waiting.length === 1 ? 'Hand them the key' : `Hand it to all ${waiting.length}`}
            </button>
          </>
        )}
      </span>
    </div>
  )
}
