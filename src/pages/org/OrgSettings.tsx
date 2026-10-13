import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getGroupHistory, updateGroup } from '../../api/groups'
import { GROUP_UI } from '../../components/forms/uiClasses'
import PrisonerPhotoPanel from '../../components/forms/PrisonerPhotoPanel'
import RelayFacilitiesPanel from '../../components/group/RelayFacilitiesPanel'
import SupportedPrisonersPanel from '../../components/group/SupportedPrisonersPanel'
import { useApi } from '../../hooks/useApi'
import { useGatedGroup } from '../../hooks/useGroup'
import type { ApiError, Chapter, ChapterService, HistoryEntry, NetworkRole, SocialLinkKey } from '../../types'
import { SERVICE_LABELS } from '../../utils/groups'
import { displayName } from '../../utils/prisoners'
import { capitalise, changes, LETTERS_SHOWN_FROM, problems, ROLES, SERVICES, SOCIAL, SOCIAL_KEYS, toForm, type GroupFormValues } from '../../utils/groupForm'
import { refusalText } from '../../utils/refusals'

// A group admin's own group. The record through
// PUT /chapter/chapter, which a group admin may send for their own active group
// (README "Chapters" > "Chapter fields": every field but accountStatus,
// vouchedBy and recordStatus, which only a site admin sets (API #192), and the
// counted lettersSent and averageTimeDays). The form has none of the three, and
// only its changed fields are sent (utils/groupForm.ts, shared with the site
// admin's admin/EditGroup.tsx). The link panels (README "What each role can
// do": an active group links itself to a facility or a prisoner) apply at once,
// apart from Save. The history is GET /chapter/history (README "The history of
// one record"), whose entries are kept 180 days.
//
// GroupGate (App.tsx) shows a pending or suspended group a notice instead of
// this page: every write here would be a 403.
//
// Markup: pages/org-settings.css, from the prototype's org-settings.html.

const SOCIAL_ICONS: Record<SocialLinkKey, string> = { instagram: '📷', mastodon: '🐘', bluesky: '🦋', x: '𝕏', youtube: '▶' }
const HISTORY_SIZE = 10

export default function OrgSettings() {
  // GroupGate has the record in before this page opens; a save reloads it for every page.
  const { group, reload } = useGatedGroup()
  const [saved, setSaved] = useState(false)
  const history = useApi(() => getGroupHistory(group.id, { page: 1, page_size: HISTORY_SIZE }), [group.id, group.updatedAt])

  return (
    <div className="settings-wrap">
      <div className="settings-inner">
        <h1 className="settings-title">Group settings</h1>
        <p className="settings-subtitle">
          {group.name}’s public profile, what it does in the network, and the facilities and prisoners it is linked to.
          {group.recordStatus === 'published' && (
            <>
              {' '}
              <Link to={`/groups/${group.id}`}>See the public page</Link>.
            </>
          )}
        </p>

        <section className="settings-section">
          <h2 className="settings-section-heading">More settings</h2>
          <ul className="settings-links">
            <li>
              <Link to="/settings/keys">Group key</Link>
              <span>Who holds the key that opens your group’s letters; hand it on or rotate it.</span>
            </li>
            <li>
              <Link to="/settings/invitations">Invitations</Link>
              <span>Bring in a new group admin, or vouch for a new group.</span>
            </li>
            <li>
              <Link to="/invite-codes">Invite codes</Link>
              <span>Print slips that let new writers make their own accounts.</span>
            </li>
            <li>
              <Link to="/blocked-writers">Blocked writers</Link>
              <span>Writers your group doesn’t mail for, and your site-wide block recommendations.</span>
            </li>
            <li>
              <Link to="/replies/new">Record a reply</Link>
              <span>File a prisoner’s answer in the writer’s conversation, by its reply reference or by name.</span>
            </li>
            <li>
              <Link to="/account/security">Your sign-in security</Link>
              <span>Two-factor sign-in for your own account.</span>
            </li>
          </ul>
        </section>

        {saved && (
          <div className="settings-alert settings-alert-ok settings-alert-block" role="status">
            Saved.{group.recordStatus === 'published' && ' The public page shows the changes now.'}
          </div>
        )}

        {/* Keyed on updatedAt: a save reloads the record, and the form starts again from it. */}
        <GroupForm
          key={group.updatedAt}
          group={group}
          onSaved={() => {
            setSaved(true)
            reload()
          }}
          onEdit={() => setSaved(false)}
        />

        {/* Keyed on id only: a link change mustn't reset unsaved form edits. */}
        <RelayFacilitiesPanel key={`relay-${group.id}`} group={group} classes={GROUP_UI} linkTo={(f) => `/facilities/${f.id}`} />
        <SupportedPrisonersPanel key={`support-${group.id}`} group={group} classes={GROUP_UI} linkTo={(p) => `/prisoners/${p.id}`} />
        <PrisonerPhotos />

        <section className="settings-section">
          <h2 className="settings-section-heading">History</h2>
          {history.loading && <p className="settings-static">Loading the history…</p>}
          {history.error && (
            <div className="settings-alert settings-alert-err">
              Couldn’t load the history ({refusalText(history.error)}).{' '}
              <button type="button" className="settings-link-button" onClick={history.reload}>
                Try again
              </button>
            </div>
          )}
          {history.data && history.data.items.length === 0 && <p className="settings-static">Nothing recorded in the last 180 days.</p>}
          {history.data && history.data.items.length > 0 && (
            <ul className="settings-history">
              {history.data.items.map((entry) => (
                <HistoryLine key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
          <p className="settings-hint" style={{ marginTop: '0.75rem' }}>
            {history.data && history.data.total > history.data.items.length
              ? `The latest ${history.data.items.length} of ${history.data.total} entries. `
              : ''}
            Entries are kept for 180 days, so this isn’t the group’s whole life. Linking a facility or a prisoner shows in that record’s history.
          </p>
        </section>
      </div>
    </div>
  )
}

interface FormProps {
  group: Chapter
  onSaved: () => void
  onEdit: () => void
}

function GroupForm({ group: g, onSaved, onEdit }: FormProps) {
  const initial = useMemo(() => toForm(g), [g])
  const [values, setValues] = useState(initial)
  const [services, setServices] = useState(() => new Set(g.services ?? []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const diff = useMemo(() => changes(g, initial, values, services), [g, initial, values, services])
  const dirty = Object.keys(diff).length > 0
  const issues = problems(values)

  // As on the site admin's page: leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  type TextKey = Exclude<keyof GroupFormValues, 'social' | 'networkRole'>
  const set = (patch: Partial<GroupFormValues>) => {
    setValues((v) => ({ ...v, ...patch }))
    onEdit()
  }
  const field = (key: TextKey) => ({
    id: `s-${key}`,
    value: values[key],
    disabled: busy,
    onChange: (e: { target: { value: string } }) => set({ [key]: e.target.value }),
  })
  const toggleService = (s: ChapterService) => {
    setServices((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
    onEdit()
  }

  const relayCount = g.relay_prisons?.length ?? 0
  const droppingRelay = values.networkRole === 'collecting' && initial.networkRole !== 'collecting'

  async function save() {
    onEdit()
    setBusy(true)
    setError(null)
    try {
      await updateGroup(g.id, diff)
      onSaved()
    } catch (err) {
      const e = err as ApiError
      setError(
        e.errors?.length
          ? e.errors.join(' ')
          : e.status === 403
            ? 'Your group can’t change its record right now: only an active group edits its own record.'
            : e.status === 404
              ? 'Your group’s record isn’t there any more.'
              : refusalText(e),
      )
      setBusy(false)
    }
  }

  return (
    <form
      className="settings-group-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty && !busy && issues.length === 0) void save()
      }}
    >
      <section className="settings-section">
        <h2 className="settings-section-heading">Group</h2>
        <div className="settings-form">
          <TextField label="Name" k="name" field={field} required />
          <div className="settings-row">
            <TextField label="Area" k="subregion" field={field} hint="City, region or area, as shown publicly: “Portland, OR”." />
            <TextField label="Country" k="country" field={field} />
          </div>
          <TextField label="Street" k="street" field={field} optional hint="Your group’s own address." />
          <div className="settings-row">
            <TextField label="City" k="city" field={field} optional />
            <TextField label="Postal code" k="postalCode" field={field} optional />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-heading">Public profile</h2>
        <div className="settings-form">
          <div className="settings-field">
            <label className="settings-label" htmlFor="s-about">
              About
            </label>
            <textarea className="settings-about-textarea" rows={5} {...field('about')} />
          </div>
          <div className="settings-field">
            <label className="settings-label" htmlFor="s-announcement">
              Announcement <span className="settings-label-optional">optional</span>
            </label>
            <textarea className="settings-textarea" rows={2} {...field('announcement')} />
            <span className="settings-hint">One current announcement, shown at the top of your group’s page. Clear it when it’s over.</span>
            <div className={values.announcement.trim() ? 'announcement-preview has-content' : 'announcement-preview'}>
              <span className="announcement-preview-label">Preview</span>
              {values.announcement.trim()}
            </div>
          </div>
          <div className="settings-row">
            <TextField label="Website" k="website" field={field} type="url" optional />
            <TextField label="Public email" k="email" field={field} type="email" optional />
          </div>
          <div className="settings-field">
            <span className="settings-label">Social links</span>
            <div className="social-fields">
              {SOCIAL_KEYS.map((k) => (
                <div key={k} className="social-field-row">
                  <span className="social-field-icon" aria-hidden="true">
                    {SOCIAL_ICONS[k]}
                  </span>
                  <input
                    className="social-field-input"
                    aria-label={SOCIAL[k]}
                    placeholder={SOCIAL[k]}
                    value={values.social[k]}
                    disabled={busy}
                    onChange={(e) => set({ social: { ...values.social, [k]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="settings-field">
            <span className="settings-label">Services</span>
            <div className="services-grid">
              {SERVICES.map((s) => (
                <label key={s} className="service-check">
                  <input type="checkbox" checked={services.has(s)} disabled={busy} onChange={() => toggleService(s)} />
                  {capitalise(SERVICE_LABELS[s])}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-heading">Network</h2>
        <div className="settings-form">
          <div className="settings-field">
            <label className="settings-label" htmlFor="s-networkRole">
              What your group does
            </label>
            <select
              id="s-networkRole"
              className="settings-input"
              value={values.networkRole}
              disabled={busy}
              onChange={(e) => set({ networkRole: e.target.value as NetworkRole })}
            >
              {(Object.keys(ROLES) as NetworkRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLES[r]}
                </option>
              ))}
            </select>
            <span className="settings-hint">A group that prints and mails is a relay group: link the facilities it mails to below.</span>
          </div>
          {droppingRelay && relayCount > 0 && (
            <div className="settings-alert settings-alert-warn">
              Your group is the relay group for {relayCount} {relayCount === 1 ? 'facility' : 'facilities'}. Changing to collecting only keeps those links,
              and letters to them still come to you; unlink them below if your group should stop.
            </div>
          )}
        </div>
      </section>

      <Numbers group={g} field={field('lettersSentBefore')} />

      {issues.length > 0 && (
        <div className="settings-alert settings-alert-warn settings-alert-block">
          {issues.map((text) => (
            <div key={text}>{text}</div>
          ))}
        </div>
      )}
      {error && <div className="settings-alert settings-alert-err settings-alert-block">{error}</div>}

      <div className="settings-save-row">
        <button type="submit" className="settings-save-btn" disabled={!dirty || busy || issues.length > 0}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <span className="settings-hint">{dirty ? 'Unsaved changes.' : 'No changes.'} The links below apply at once, without Save.</span>
      </div>
    </form>
  )
}

type FieldProps = { id: string; value: string; disabled: boolean; onChange: (e: { target: { value: string } }) => void }

function TextField({
  label,
  k,
  field,
  hint,
  optional,
  required,
  type,
}: {
  label: string
  k: Exclude<keyof GroupFormValues, 'social' | 'networkRole'>
  field: (k: Exclude<keyof GroupFormValues, 'social' | 'networkRole'>) => FieldProps
  hint?: string
  optional?: boolean
  required?: boolean
  type?: string
}) {
  return (
    <div className="settings-field">
      <label className="settings-label" htmlFor={`s-${k}`}>
        {label} {optional && <span className="settings-label-optional">optional</span>}
      </label>
      <input className="settings-input" type={type} required={required} {...field(k)} />
      {hint && <span className="settings-hint">{hint}</span>}
    </div>
  )
}

/**
 * The group's numbers (README "Chapter fields"): lettersSent is
 * lettersSentBefore plus lettersCounted, null (and off the public page) under
 * 20; averageTimeDays is the median days from queued to mailed over 90 days,
 * null under 5 mailings. Both are counted by the server, refreshed every six
 * hours; only lettersSentBefore is typed.
 */
function Numbers({ group: g, field }: { group: Chapter; field: FieldProps }) {
  const counted = g.lettersCounted ?? 0
  const before = g.lettersSentBefore ?? 0
  const total = before + counted
  return (
    <section className="settings-section">
      <h2 className="settings-section-heading">Numbers</h2>
      <div className="settings-form">
        <div className="settings-numbers">
          <div className="stat">
            <span className="stat-number">{counted}</span>
            <span className="stat-label">Marked mailed here</span>
          </div>
          <div className="stat">
            <span className="stat-number">{g.lettersSent ?? total}</span>
            <span className="stat-label">{g.lettersSent ? 'Letters sent, shown publicly' : 'Letters sent, not shown yet'}</span>
          </div>
          <div className="stat">
            <span className="stat-number">{g.averageTimeDays ?? '–'}</span>
            <span className="stat-label">Median days to mail</span>
          </div>
        </div>
        <p className="settings-hint">
          Your public count is the letters sent before joining plus every letter marked mailed here. It appears on your group’s page once it reaches{' '}
          {LETTERS_SHOWN_FROM}
          {g.lettersSent ? '' : ` (${Math.max(0, LETTERS_SHOWN_FROM - total)} to go)`}, so a small group isn’t put on show. The median time from
          queued to mailed covers the last 90 days and appears once there are 5 mailings in that time. The server counts both and refreshes the
          median every six hours.
        </p>
        <div className="settings-field">
          <label className="settings-label" htmlFor={field.id}>
            Letters sent before joining
          </label>
          <input className="settings-input" inputMode="numeric" style={{ maxWidth: '12rem' }} {...field} />
          <span className="settings-hint">What your group mailed before it used this site. Saved with the rest of the form.</span>
        </div>
      </div>
    </section>
  )
}

/**
 * The supported prisoners, each with a Photo button that opens the photo panel
 * (components/forms/PrisonerPhotoPanel.tsx) in the group's words: the person
 * agreed to it, and there is no credit. A section of its own beside the
 * Supports panel; the list is the group's record, so a prisoner linked just now
 * appears once the record is read again.
 */
function PrisonerPhotos() {
  const { group, reload } = useGatedGroup()
  const [open, setOpen] = useState<number | null>(null)
  const supported = group.supported_prisoners ?? []

  return (
    <section className="settings-section">
      <h2 className="settings-section-heading">Photos</h2>
      <p className="settings-hint">
        A photo of a prisoner your group supports, for their public page. Any group admin may add one, once the person has agreed to it.
      </p>
      {supported.length === 0 ? (
        <p className="settings-static">Link a prisoner under Supports first.</p>
      ) : (
        <ul className="settings-list">
          {supported.map((p) => (
            <li key={p.id} style={open === p.id ? { display: 'block' } : undefined}>
              <span className="settings-list-name">{displayName(p)}</span>{' '}
              {open !== p.id && <span className="settings-sub">{p.photo ? 'Has a photo' : 'No photo'}</span>}{' '}
              {open !== p.id && (
                <button type="button" className="settings-btn" onClick={() => setOpen(p.id)}>
                  Photo
                </button>
              )}
              {open === p.id && (
                <PrisonerPhotoPanel
                  mode="group"
                  prisoner={p}
                  onClose={() => {
                    setOpen(null)
                    reload()
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="settings-hint">
        Linked someone just now?{' '}
        <button type="button" className="settings-link-button" onClick={reload}>
          Read the list again
        </button>
      </p>
    </section>
  )
}

/** Each kind of entry in words (README "The history of one record"; the actions the API records on a group). */
const ACTIONS: Record<string, string> = {
  'chapter.create': 'Group created',
  'chapter.update': 'Record edited',
  'chapter.delete': 'Group deleted',
  'chapter.keys': 'Group key set up',
  'chapter.keys.rotate': 'Group key rotated',
  'chapter.member-key': 'Group key handed to a group admin',
  'chapter.member-key.remove': 'A group admin stopped being handed the group key',
  'chapter.owner': 'Group-owner admin changed',
  'chapter.two-factor': 'Two-factor sign-in requirement changed',
  'chapter.block': 'Writer blocked',
  'chapter.block.remove': 'Writer unblocked',
  'invite-code.issue': 'Invite codes issued',
  'invite-code.cancel': 'Invite codes cancelled',
  'invite-code.join': 'An invite code was used',
}

/** Field names as the form says them. */
const FIELD_NAMES: Record<string, string> = {
  name: 'name',
  location: 'address',
  subregion: 'area',
  country: 'country',
  about: 'about',
  website: 'website',
  email: 'public email',
  socialLinks: 'social links',
  services: 'services',
  announcement: 'announcement',
  networkRole: 'network role',
  accountStatus: 'account status',
  vouchedBy: 'vouched for by',
  lettersSentBefore: 'letters sent before joining',
  recordStatus: 'record status',
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

function HistoryLine({ entry }: { entry: HistoryEntry }) {
  const fields = Object.keys(entry.changes ?? {}).map((f) => FIELD_NAMES[f] ?? f)
  const count = typeof entry.details?.count === 'number' ? entry.details.count : typeof entry.details?.cancelled === 'number' ? entry.details.cancelled : null
  const who = entry.actor ? (entry.actor.role === 'admin' ? `a site admin (${entry.actor.username})` : entry.actor.name || entry.actor.username) : 'the site itself'
  return (
    <li>
      <div className="settings-history-when">
        {when(entry.at)}
        {/* Nobody is named for a code used: the group never learns who joined with one (README "Invite codes"). */}
        {entry.action !== 'invite-code.join' && ` · ${who}`}
      </div>
      <div>
        <span className="settings-history-what">{ACTIONS[entry.action] ?? entry.action}</span>
        {count !== null && ` (${count})`}
        {entry.action === 'chapter.update' && (fields.length > 0 ? `: ${fields.join(', ')}` : ': nothing changed')}
      </div>
    </li>
  )
}
