import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../api/client'
import { getMemberKeys, getRotation, passOwnership, postRotation, removeMemberKey, setChapterKeys } from '../../api/groups'
import { getUnreadNotifications, markNotificationsRead } from '../../api/notifications'
import { MembersWaitingNotice } from '../../components/group'
import LoadState from '../../components/ui/LoadState'
import { generateKeypair, sealPrivateKeyTo, type Keypair } from '../../crypto'
import { adminName, errorText, EVERY_HOLDER, fingerprintsOf, handKeyTo, isStaleKey, type OrgKey } from '../../groups/keys'
import { checkResealed, reseal } from '../../groups/rotation'
import { useGroupKeyRefresh } from '../../groups/useGroupKeyRefresh'
import { useAuth } from '../../hooks/useAuth'
import { useGatedGroup, type GroupState } from '../../hooks/useGroup'
import { announceUnreadCount } from '../../hooks/useUnreadCount'
import type { ApiError, GroupMemberKeyState, MemberKeyRoster, NotificationEvent } from '../../types'
import { longDate } from '../../utils/dates'

// The group key (README "End-to-end mode" → "Group keys", "Rotating a group
// key", "Latecomers"; web issue #26): who holds it, setting it up, handing it
// out, taking it back, passing ownership, and rotating it, which only the
// website does (both apps leave it here). Every key is made and opened in this
// browser; the server only ever stores what is sealed. GroupGate has already
// shown a notice instead of this page if the group isn't active.
//
// Markup from org-settings.css (settings-*), the roster in style.css's table.

/** Feed events that change who holds the key or owns it (README "The feed"). */
const KEY_EVENTS: NotificationEvent[] = ['group.key', 'group.owner', 'group.waiting']

type Note = { ok: boolean; text: string } | null

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function NoteLine({ note }: { note: Note }) {
  if (!note) return null
  return (
    <div className={note.ok ? 'settings-hint' : 'danger-zone danger-zone-body'} role={note.ok ? 'status' : 'alert'} style={note.ok ? { color: '#2a6e2a' } : undefined}>
      {note.text}
    </div>
  )
}

/** Which section an outcome is shown under, so it outlives the section reloading. */
type Where = 'setup' | 'roster' | 'rotate'
type Said = { where: Where; ok: boolean; text: string } | null

export default function GroupKeys() {
  const { user, keys } = useAuth()
  const group = useGatedGroup()
  const refreshKey = useGroupKeyRefresh()
  const chapter = group.chapterId
  const [version, setVersion] = useState(0)
  // The roster stays on screen while it is read again after a change.
  const [roster, setRoster] = useState<{ data: MemberKeyRoster | null; error: ApiError | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  })
  const [said, setSaid] = useState<Said>(null)

  useEffect(() => {
    if (chapter === null) return
    let live = true
    getMemberKeys(chapter)
      .then((data) => live && setRoster({ data, error: null, loading: false }))
      .catch((err: unknown) => live && setRoster((r) => ({ data: r.data, error: toApiError(err), loading: false })))
    return () => {
      live = false
    }
  }, [chapter, version])

  /** Read the roster, the group's record (its owner) and, if asked, this session's key again. */
  const reloadAll = async (withKey = false) => {
    if (withKey) await refreshKey().catch(() => null)
    setVersion((v) => v + 1)
    group.reload()
  }
  const say = (where: Where) => (note: Note) => setSaid(note ? { where, ...note } : null)
  const noteFor = (where: Where): Note => (said?.where === where ? { ok: said.ok, text: said.text } : null)

  // Someone handed this admin the key, took it back, rotated it, or passed
  // ownership since they signed in: the feed says so (README "The feed"). Read
  // once when the page opens; the page doesn't poll. Once acted on (the key read
  // again, the roster and the record reloaded), those entries are marked read,
  // so the next visit doesn't do it all again; a key refresh that fails leaves
  // the `group.key` ones unread, for the next visit (or the inbox) to retry.
  const checkedFeed = useRef(false)
  useEffect(() => {
    if (checkedFeed.current) return
    checkedFeed.current = true
    void (async () => {
      const items = await getUnreadNotifications().catch(() => [])
      const entries = items.filter((n) => KEY_EVENTS.includes(n.event))
      if (entries.length === 0) return
      const keyEntries = entries.filter((n) => n.event === 'group.key')
      const keyOk = keyEntries.length === 0 || (await refreshKey().then(() => true, () => false))
      await reloadAll()
      const ids = (keyOk ? entries : entries.filter((n) => n.event !== 'group.key')).map((n) => n.id)
      const result = ids.length > 0 ? await markNotificationsRead(ids).catch(() => null) : null
      if (result) announceUnreadCount(result.unread)
    })()
    // Once, on opening the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!user || chapter === null) return null
  const data = roster.data
  const owner = data?.members.find((m) => m.id === data.owner) ?? null
  // The rotation's ticks start again whenever who holds the key changes.
  const holders = data ? `${data.keyVersion}:${data.members.filter((m) => m.holdsGroupKey).map((m) => m.id).join(',')}` : ''

  return (
    <div className="settings-wrap">
      <div className="settings-inner">
        <Link to="/settings" className="settings-back">
          ← Group settings
        </Link>
        <h1 className="settings-title">Group key</h1>
        <p className="settings-subtitle">
          Letters to {group.group.name} are sealed to the group's key. Only group admins who hold it can read them; a site
          admin never can.
        </p>

        <section className="settings-section">
          <h2 className="settings-section-heading">Your group's key</h2>
          {!data && (
            <LoadState state={{ data: null, error: roster.error, loading: roster.loading, reload: () => void reloadAll() }} what="group key" />
          )}
          {data && <KeySummary roster={data} group={group} ownerName={owner ? adminName(owner) : null} />}
          {data && data.publicKey && <NoteLine note={noteFor('setup')} />}
        </section>

        {data && group.keyState === 'no-key' && !data.publicKey && (
          <SetUpKey
            chapter={chapter}
            group={group}
            roster={data}
            orgKey={keys?.orgKey ?? null}
            note={noteFor('setup')}
            onNote={say('setup')}
            onDone={(withKey) => void reloadAll(withKey)}
          />
        )}

        {data && group.keyState === 'not-held' && (
          <section className="settings-section">
            <h2 className="settings-section-heading">You don't hold the key yet</h2>
            <p className="settings-hint">
              {owner && owner.id !== user.id ? `${adminName(owner)}, the group-owner admin,` : 'The group-owner admin'} hands the key to group
              admins.{' '}
              {/* Only what the roster says: waiting is an admin with keys of their own and no copy of the group's. */}
              {data.members.some((m) => m.id === user.id && m.holdsGroupKey)
                ? 'You were handed it, but your copy didn’t open in this session: check again, or sign out and in again.'
                : data.waiting.includes(user.id)
                  ? 'You’re on their list of admins waiting for it. Once they have handed it to you, it opens here without signing in again.'
                  : 'Once they have handed it to you, it opens here without signing in again.'}
            </p>
            <p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void reloadAll(true)}>
                Check again
              </button>
            </p>
          </section>
        )}

        {data && (
          <Roster
            chapter={chapter}
            roster={data}
            group={group}
            note={noteFor('roster')}
            onNote={say('roster')}
            onChanged={(withKey) => void reloadAll(withKey)}
            noticeKey={version}
          />
        )}

        {data && <Fingerprints roster={data} />}

        {data && data.publicKey && group.isOwner && group.keyState === 'ready' && (
          <Rotate
            chapter={chapter}
            roster={data}
            orgKey={keys?.orgKey ?? null}
            note={noteFor('rotate')}
            onNote={say('rotate')}
            onDone={(withKey) => void reloadAll(withKey)}
            key={holders}
          />
        )}
        {data && !(group.isOwner && group.keyState === 'ready') && <NoteLine note={noteFor('rotate')} />}
      </div>
    </div>
  )
}

function KeySummary({ roster, group, ownerName }: { roster: MemberKeyRoster; group: GroupState; ownerName: string | null }) {
  if (!roster.publicKey)
    return (
      <p className="settings-hint">
        Your group has no key yet, so nothing can be sealed to it: letters can't be relayed or printed through the group, and its writers
        can't be given keys. {ownerName ? `Its group-owner admin is ${ownerName}.` : 'It has no group-owner admin yet.'}
      </p>
    )
  return (
    <div className="settings-form">
      <div className="settings-field">
        <span className="settings-label">Key</span>
        <span>
          Version {roster.keyVersion}
          {roster.keyRotatedAt ? `, last rotated ${longDate(roster.keyRotatedAt)}` : ', never rotated'}.
        </span>
      </div>
      <div className="settings-field">
        <span className="settings-label">Group-owner admin</span>
        <span>{ownerName ?? 'None'}</span>
        <span className="settings-hint">The one group admin who hands the key out, takes it back, rotates it, and can pass ownership on.</span>
      </div>
      <div className="settings-field">
        <span className="settings-label">You</span>
        <span>
          {group.keyState === 'ready'
            ? group.isOwner
              ? 'You hold the key, and you are the group-owner admin.'
              : 'You hold the key.'
            : "You don't hold the key yet."}
        </span>
      </div>
    </div>
  )
}

// --- Setting it up ---------------------------------------------------------------

function SetUpKey({
  chapter,
  group,
  roster,
  orgKey,
  note,
  onNote: setNote,
  onDone,
}: {
  chapter: number
  group: GroupState
  roster: MemberKeyRoster
  orgKey: OrgKey | null
  note: Note
  onNote: (note: Note) => void
  onDone: (withKey: boolean) => void
}) {
  const { user, keypair, groupKeySet } = useAuth()
  const [busy, setBusy] = useState(false)
  const owner = roster.members.find((m) => m.id === roster.owner)

  // README "Group keys": the first group admin makes the group's keypair on their
  // own device and seals the private half to their own public key; the server
  // stores only that. They become the group-owner admin if the group has none.
  async function setUp() {
    if (!keypair || !user) return
    setBusy(true)
    setNote(null)
    try {
      const groupKeypair = await generateKeypair()
      const wrapped = await sealPrivateKeyTo(groupKeypair.privateKey, keypair.publicKey)
      const done = await setChapterKeys(chapter, groupKeypair.publicKey, wrapped)
      // Into the session at once, so this admin can act without signing in again.
      groupKeySet(groupKeypair, {
        chapterId: chapter,
        chapterName: orgKey?.chapterName ?? group.group?.name ?? '',
        chapterPublicKey: groupKeypair.publicKey,
        wrappedOrgPrivateKey: wrapped,
        keyVersion: done.keyVersion,
        owner: done.owner,
        isOwner: done.owner === user.id,
      })
      // README "Latecomers": letters the server still held a key for are sealed to the new key.
      const caught = done.caughtUp && done.caughtUp.sealed > 0 ? ` ${count(done.caughtUp.sealed, 'earlier letter was', 'earlier letters were')} sealed to it.` : ''
      setNote({ ok: true, text: `Your group's key is set up.${caught}` })
      onDone(false)
    } catch (err) {
      const e = toApiError(err)
      if (e.status === 409 && e.name === 'KeyChangeError') {
        setNote({
          ok: false,
          text: 'Another group admin set up the key a moment ago, so this one wasn’t used. The group-owner admin hands it to you.',
        })
        onDone(true)
      } else setNote({ ok: false, text: `Couldn’t set up the key (${errorText(err)}).` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-heading">Set up the group key</h2>
      <div className="settings-form">
        <p className="settings-hint">
          Your browser makes the key here and seals it to your own keys; the server never sees it.{' '}
          {owner
            ? `${adminName(owner)} stays the group-owner admin: they hand the key to the other group admins.`
            : 'Whoever sets it up becomes the group-owner admin, because the group has none yet: the one who hands the key to the other group admins, takes it back, and rotates it.'}
        </p>
        <p className="settings-hint">
          <strong>{EVERY_HOLDER}</strong>
        </p>
        <div className="settings-save-row">
          <button type="button" className="settings-save-btn" disabled={busy || !keypair} onClick={() => void setUp()}>
            {busy ? 'Setting it up…' : 'Set up the group key'}
          </button>
        </div>
        <NoteLine note={note} />
      </div>
    </section>
  )
}

// --- Who holds it ------------------------------------------------------------------

function keyStatus(m: GroupMemberKeyState, roster: MemberKeyRoster) {
  if (!m.publicKey) return 'Hasn’t signed in with keys yet'
  if (!roster.publicKey) return 'Has keys of their own'
  if (m.holdsGroupKey) return 'Holds the key'
  if (roster.waiting.includes(m.id)) return 'Waiting for the key'
  return 'Doesn’t hold the key'
}

function Roster({
  chapter,
  roster,
  group,
  note,
  onNote: setNote,
  onChanged,
  noticeKey,
}: {
  chapter: number
  roster: MemberKeyRoster
  group: GroupState
  note: Note
  onNote: (note: Note) => void
  onChanged: (withKey: boolean) => void
  /** Changes when the page reads the roster again, so the waiting notice reads it again too. */
  noticeKey: number
}) {
  const { user, groupKeypair } = useAuth()
  const [busy, setBusy] = useState(false)
  // Only the group-owner admin manages holders, and only with the key open here to seal it.
  const manages = group.isOwner && group.keyState === 'ready' && Boolean(roster.publicKey)
  const owner = roster.members.find((m) => m.id === roster.owner)

  async function act(action: () => Promise<string>, refusal: (err: unknown) => string) {
    setBusy(true)
    setNote(null)
    try {
      setNote({ ok: true, text: await action() })
      onChanged(false)
    } catch (err) {
      setNote({ ok: false, text: refusal(err) })
      if (isStaleKey(err)) onChanged(true)
    } finally {
      setBusy(false)
    }
  }

  function hand(m: GroupMemberKeyState) {
    if (!groupKeypair || !m.publicKey) return
    const name = adminName(m)
    if (!window.confirm(`Hand the group key to ${name}?\n\n${EVERY_HOLDER}`)) return
    void act(
      async () => {
        await handKeyTo(chapter, { id: m.id, publicKey: m.publicKey as string }, groupKeypair, group.keyVersion)
        return `Handed the key to ${name}.`
      },
      (err) =>
        isStaleKey(err)
          ? 'The group key changed meanwhile (it was rotated), so the copy you hold here is out of date. It has been fetched again; try once more.'
          : `Couldn’t hand the key to ${name} (${errorText(err)}).`,
    )
  }

  function stop(m: GroupMemberKeyState) {
    const name = adminName(m)
    if (
      !window.confirm(
        `Stop handing the group key to ${name}?\n\nThis can’t take back a key they already opened: they could still read the letters stored before. To shut them out of everything the group stores from now on, rotate the key and leave them out.`,
      )
    )
      return
    void act(
      async () => {
        await removeMemberKey(chapter, m.id)
        return `${name} is no longer handed the key.`
      },
      (err) => {
        const e = toApiError(err)
        if (e.status === 409 && e.name === 'KeyChangeError') return `${name} is the last holder of the key, and the last holder can’t be removed.`
        if (e.status === 404) return `${name} didn’t hold the key.`
        return `Couldn’t stop handing the key to ${name} (${errorText(err)}).`
      },
    )
  }

  function makeOwner(m: GroupMemberKeyState) {
    const name = adminName(m)
    if (
      !window.confirm(
        `Make ${name} the group-owner admin?\n\nFrom then on they hand the key out, take it back and rotate it, and you can’t. You keep your copy of the key.`,
      )
    )
      return
    void act(
      async () => {
        await passOwnership(chapter, m.id)
        return `${name} is the group-owner admin now.`
      },
      (err) => {
        const e = toApiError(err)
        // CHANGELOG #167: ownership only goes to a group admin who holds the key.
        if (e.name === 'OwnerError' && e.condition === 'no_key')
          return `Hand ${name} the key first: an owner without it couldn’t hand it on, take it back, or rotate it.`
        return `Couldn’t make ${name} the owner (${errorText(err)}).`
      },
    )
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-heading">Group admins</h2>
      {manages ? (
        <>
          <p className="settings-hint">
            <strong>{EVERY_HOLDER}</strong>
          </p>
          <MembersWaitingNotice onHanded={() => onChanged(false)} reloadKey={noticeKey} />
        </>
      ) : (
        roster.publicKey && (
          <p className="settings-hint">
            Only the group-owner admin{owner ? `, ${adminName(owner)},` : ''} hands the key out and takes it back.
          </p>
        )
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="prisons-table">
          <thead>
            <tr>
              <th>Group admin</th>
              <th>Group key</th>
              {manages && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {roster.members.map((m) => (
              <tr key={m.id}>
                <td>
                  {adminName(m)}
                  {m.id === user?.id && ' (you)'}
                  {m.id === roster.owner && <div className="settings-hint">Group-owner admin</div>}
                </td>
                <td>{keyStatus(m, roster)}</td>
                {manages && (
                  <td>
                    {m.id !== user?.id && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {!m.holdsGroupKey && m.publicKey && (
                          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => hand(m)}>
                            Hand the key
                          </button>
                        )}
                        {m.holdsGroupKey && (
                          <>
                            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => makeOwner(m)}>
                              Make owner
                            </button>
                            <button type="button" className="danger-btn" disabled={busy} onClick={() => stop(m)}>
                              Stop handing it
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {manages && roster.members.some((m) => !m.publicKey) && (
        <p className="settings-hint">
          A group admin who hasn’t signed in with keys yet can’t be handed the key: there is nothing to seal it to. Once they sign in, they
          show up here as waiting.
        </p>
      )}
      <NoteLine note={note} />
    </section>
  )
}

// --- Fingerprints -------------------------------------------------------------------

/**
 * A fingerprint of every public key on this page (crypto/fingerprint.ts), so
 * group admins can compare them out of band (web audit 8 Oct, section 6). Every
 * key here comes from the server; only this admin's own key and, if they hold
 * it, the group's are opened in this browser, so those two are also checked
 * against what the server lists. Nothing is pinned: the page remembers no
 * fingerprint between visits.
 */
function Fingerprints({ roster }: { roster: MemberKeyRoster }) {
  const { user, keypair, groupKeypair } = useAuth()
  const keys = [roster.publicKey, keypair?.publicKey, groupKeypair?.publicKey, ...roster.members.map((m) => m.publicKey)]
  const wanted = keys.filter(Boolean).join(',')
  const [prints, setPrints] = useState<{ for: string; map: Map<string, string | null> } | null>(null)

  useEffect(() => {
    let live = true
    void fingerprintsOf(wanted.split(',')).then((map) => live && setPrints({ for: wanted, map }))
    return () => {
      live = false
    }
  }, [wanted])

  const map = prints?.for === wanted ? prints.map : null
  const show = (key: string | null | undefined) => {
    if (!key) return '—'
    if (!map) return '…'
    return map.get(key) ?? 'not a valid key: tell your site admin'
  }
  const me = roster.members.find((m) => m.id === user?.id)
  // These two were opened (or derived) here, so a difference from the server's copy means the server's is wrong.
  const ownDiffers = !!keypair && !!me?.publicKey && me.publicKey !== keypair.publicKey
  const groupDiffers = !!groupKeypair && !!roster.publicKey && roster.publicKey !== groupKeypair.publicKey

  return (
    <section className="settings-section">
      <h2 className="settings-section-heading">Key fingerprints</h2>
      <p className="settings-hint">
        A fingerprint is a short summary of a public key. Every public key on this page, and every one your browser seals a letter or the group key
        to, comes from the server. A server that was broken into could hand out a key of its own instead of a group admin’s or the group’s, and
        then read whatever is sealed to it. Comparing fingerprints outside this site is how you check: in person or on a call, each group admin
        reads out their own fingerprint from this page, and the others check that it matches the line here.
      </p>
      <p className="settings-hint">
        The group’s fingerprint changes when the key is rotated, and an admin’s when they set up new keys: compare again then. The phone apps
        don’t show fingerprints yet, so compare website with website. Each fingerprint is the first half of the SHA-256 of the key, as eight
        groups of four characters.
      </p>
      {(ownDiffers || groupDiffers) && (
        <div className="danger-zone danger-zone-body" role="alert">
          {ownDiffers && 'The server lists a different public key for you than the one your own keys open to. '}
          {groupDiffers && 'The server lists a different group key than the one you hold. '}
          Don’t hand out the group key or rotate it until a site admin has looked into this.
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="prisons-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Fingerprint</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>The group’s key{roster.publicKey ? ` (version ${roster.keyVersion})` : ''}</td>
              <td>
                <code>{roster.publicKey ? show(roster.publicKey) : 'No key yet'}</code>
              </td>
            </tr>
            <tr>
              <td>Your own key, as your browser holds it</td>
              <td>
                <code>{show(keypair?.publicKey)}</code>
              </td>
            </tr>
            {roster.members.map((m) => (
              <tr key={m.id}>
                <td>
                  {adminName(m)}
                  {m.id === user?.id && ' (you, as the server lists you)'}
                </td>
                <td>
                  <code>{m.publicKey ? show(m.publicKey) : 'No keys yet'}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// --- Rotating it -------------------------------------------------------------------

/** How many times a rotation starts again after a letter arrives or a writer claims meanwhile. */
const ROTATION_ATTEMPTS = 3

function Rotate({
  chapter,
  roster,
  orgKey,
  note,
  onNote: setNote,
  onDone,
}: {
  chapter: number
  roster: MemberKeyRoster
  orgKey: OrgKey | null
  note: Note
  onNote: (note: Note) => void
  onDone: (withKey: boolean) => void
}) {
  const { user, keypair, groupKeypair, groupKeySet } = useAuth()
  const refreshKey = useGroupKeyRefresh()
  const candidates = roster.members.filter((m) => m.publicKey)
  const withoutKeys = roster.members.filter((m) => !m.publicKey)
  // Every current holder is ticked to begin with; the owner (this admin) is always kept.
  const [keep, setKeep] = useState<Set<number>>(() => new Set(candidates.filter((m) => m.holdsGroupKey || m.id === user?.id).map((m) => m.id)))
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')

  const toggle = (id: number, on: boolean) =>
    setKeep((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  async function rotate() {
    if (!user || !keypair || !groupKeypair) return
    const kept = candidates.filter((m) => keep.has(m.id) || m.id === user.id)
    const left = roster.members.filter((m) => m.holdsGroupKey && !kept.some((k) => k.id === m.id))
    const question =
      `Rotate the group key now, and hand the new one to ${kept.map(adminName).join(', ')}?` +
      (left.length > 0 ? `\n\n${left.map(adminName).join(', ')} will no longer be able to open anything the group stores.` : '') +
      '\n\nKeep this page open until it’s done.'
    if (!window.confirm(question)) return

    setBusy(true)
    setNote(null)
    let current: Keypair | null = groupKeypair
    let why = ''
    try {
      for (let attempt = 1; attempt <= ROTATION_ATTEMPTS; attempt++) {
        // README "Rotating a group key", step 1: everything sealed to the current key.
        setStep(why ? `${why} Starting again…` : 'Fetching everything sealed to the group’s key…')
        const material = await getRotation(chapter)
        if (!current || material.publicKey !== current.publicKey) {
          // This session's copy is out of date (someone rotated before): fetch the current one.
          current = await refreshKey()
          if (!current || material.publicKey !== current.publicKey) {
            setNote({ ok: false, text: 'The group key in this session isn’t the group’s current key, and the current one didn’t open. Sign in again.' })
            return
          }
        }
        // Step 2: a new keypair; every item opened with the old key and sealed to the new one.
        setStep(`Re-sealing ${count(material.envelopes.length, 'letter')} and ${count(material.writers.length, 'writer’s key', 'writers’ keys')}…`)
        const fresh = await generateKeypair()
        const keepIds = kept.map((m) => m.id).filter((id) => material.members.some((m) => m.id === id && m.publicKey))
        const input = await reseal(material, current, fresh, keepIds)
        // The server checks that everything was re-sealed, not that it was re-sealed right.
        if (!(await checkResealed(material, input, current, fresh))) {
          setNote({ ok: false, text: 'A re-sealed letter didn’t open with the new key, so nothing was changed. Try again.' })
          return
        }
        // Step 3: all at once, or not at all.
        setStep('Saving the new key…')
        try {
          const done = await postRotation(input)
          const mine = input.members.find((m) => m.user === user.id)
          if (mine && orgKey) {
            groupKeySet(fresh, { ...orgKey, chapterPublicKey: fresh.publicKey, wrappedOrgPrivateKey: mine.wrappedOrgPrivateKey, keyVersion: done.keyVersion })
          } else await refreshKey().catch(() => null)
          const removed = roster.members.filter((m) => done.removed.includes(m.id)).map(adminName)
          setNote({
            ok: true,
            text:
              `The group key is rotated (version ${done.keyVersion}): ${count(done.envelopes, 'letter')} and ` +
              `${count(done.writers, 'writer’s key', 'writers’ keys')} re-sealed; ` +
              `${count(done.members.length, 'group admin holds', 'group admins hold')} the new key.` +
              (removed.length > 0 ? ` No longer holding it: ${removed.join(', ')}.` : ''),
          })
          onDone(false)
          return
        } catch (err) {
          const e = toApiError(err)
          if (e.status === 409 && e.name === 'RotationIncompleteError') why = 'A letter arrived, or a writer claimed their account, while rotating.'
          else if (e.status === 409 && e.name === 'KeyVersionError') {
            why = 'The group key changed while rotating.'
            current = await refreshKey().catch(() => null)
          } else throw err
        }
      }
      setNote({ ok: false, text: `${why} It kept changing, so nothing was rotated. Try again in a moment.` })
    } catch (err) {
      setNote({ ok: false, text: `Couldn’t rotate the key (${errorText(err)}). Nothing was changed.` })
    } finally {
      setBusy(false)
      setStep('')
    }
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-heading">Rotate the key</h2>
      <div className="settings-form">
        <p className="settings-hint">
          Rotating replaces the group’s key with a new one. Your browser opens every letter and every managed writer’s key the group holds
          with the old key, seals each to the new one, and hands the new key to the group admins ticked below.
        </p>
        <p className="settings-hint">
          <strong>What it does:</strong> whoever is left out can open nothing the group stores from then on, earlier letters included. It
          is how a group admin is really removed;{' '}
          {roster.members.length > 1 ? 'stopping the hand-out above isn’t enough' : 'taking the key back isn’t enough'} once they have opened the key.
        </p>
        <p className="settings-hint">
          <strong>What it can’t do:</strong> someone who copied the key or letters while they held it keeps the letters they already had.
        </p>
        <div className="settings-field">
          <span className="settings-label">Who keeps the key</span>
          {candidates.map((m) => (
            <label key={m.id} className="service-check">
              <input
                type="checkbox"
                checked={m.id === user?.id || keep.has(m.id)}
                disabled={busy || m.id === user?.id}
                onChange={(e) => toggle(m.id, e.target.checked)}
              />
              <span>
                {adminName(m)}
                {m.id === user?.id ? ' (you, the owner: always kept)' : m.holdsGroupKey ? '' : ' (doesn’t hold it now)'}
              </span>
            </label>
          ))}
          {withoutKeys.length > 0 && (
            <span className="settings-hint">
              Not listed, because they haven’t signed in with keys yet: {withoutKeys.map(adminName).join(', ')}.
            </span>
          )}
          {candidates.some((m) => keep.has(m.id) && !m.holdsGroupKey && m.id !== user?.id) && <span className="settings-hint">{EVERY_HOLDER}</span>}
        </div>
        <div className="settings-save-row">
          <button type="button" className="settings-save-btn" disabled={busy || !groupKeypair} onClick={() => void rotate()}>
            {busy ? 'Rotating…' : 'Rotate the key'}
          </button>
          {step && <span className="settings-hint">{step}</span>}
        </div>
        <NoteLine note={note} />
      </div>
    </section>
  )
}
