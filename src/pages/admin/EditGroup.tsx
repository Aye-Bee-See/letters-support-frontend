import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getAllFacilities, linkRelayGroup, unlinkRelayGroup } from '../../api/facilities'
import { deleteGroup, getAllGroups, getGroup, updateGroup, type GroupFields } from '../../api/groups'
import { getAllPrisoners, linkSupportGroup, unlinkSupportGroup } from '../../api/prisoners'
import { Field, Section } from '../../components/forms/AdminFormParts'
import { useApi } from '../../hooks/useApi'
import type { AccountStatus, ApiError, Chapter, ChapterService, NetworkRole, Prison, Prisoner, RecordStatus, SocialLinkKey } from '../../types'
import { SERVICE_LABELS } from '../../utils/groups'
import { displayName } from '../../utils/prisoners'

// Edit one group (PUT /chapter/chapter, superadmins only). Only changed fields
// are sent; `location` and `socialLinks` are JSON values, so they go whole.
// Two kinds of link have their own panels and change at once, apart from Save:
// the facilities the group relays for (PUT/DELETE /prison/relay) and the
// prisoners it supports (PUT/DELETE /prisoner/support). Group keys are set by
// the group's own members through /auth, never here.

const ROLES: Record<NetworkRole, string> = {
  collecting: 'Collects letters (forwards them to relay groups)',
  relay: 'Prints and mails letters',
  both: 'Collects, prints and mails',
}
const ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended']
const RECORD_STATUSES: RecordStatus[] = ['published', 'pending', 'draft']
const SERVICES = Object.keys(SERVICE_LABELS) as ChapterService[]
const SOCIAL: Record<SocialLinkKey, string> = { instagram: 'Instagram', mastodon: 'Mastodon', bluesky: 'Bluesky', x: 'X', youtube: 'YouTube' }
const SOCIAL_KEYS = Object.keys(SOCIAL) as SocialLinkKey[]
/** location keys the form edits; any others the record has are kept. */
const LOCATION_KEYS = ['street', 'city', 'postalCode']

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface FormValues {
  name: string
  street: string
  city: string
  postalCode: string
  subregion: string
  country: string
  about: string
  announcement: string
  website: string
  email: string
  social: Record<SocialLinkKey, string>
  networkRole: NetworkRole
  accountStatus: AccountStatus
  recordStatus: string
  vouchedBy: string
  lettersSentBefore: string
}

function toForm(g: Chapter): FormValues {
  const loc = g.location ?? {}
  return {
    name: g.name,
    street: loc.street ?? '',
    city: loc.city ?? '',
    postalCode: loc.postalCode ?? '',
    subregion: g.subregion ?? '',
    country: g.country ?? '',
    about: g.about ?? '',
    announcement: g.announcement ?? '',
    website: g.website ?? '',
    email: g.email ?? '',
    social: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, g.socialLinks?.[k] ?? ''])) as Record<SocialLinkKey, string>,
    networkRole: g.networkRole,
    accountStatus: g.accountStatus,
    recordStatus: g.recordStatus ?? 'published',
    vouchedBy: g.vouchedBy !== null ? String(g.vouchedBy) : '',
    lettersSentBefore: String(g.lettersSentBefore ?? 0),
  }
}

function buildLocation(original: Record<string, string>, v: FormValues): Record<string, string> {
  const out = Object.fromEntries(Object.entries(original).filter(([key]) => !LOCATION_KEYS.includes(key)))
  for (const key of ['street', 'city', 'postalCode'] as const) if (v[key].trim()) out[key] = v[key].trim()
  return out
}
/** Only the links that are set; an empty object when none are. */
const buildSocial = (v: FormValues) => Object.fromEntries(SOCIAL_KEYS.filter((k) => v.social[k].trim()).map((k) => [k, v.social[k].trim()]))

/** Problems the API would refuse, said before the request. */
function problems(v: FormValues): string[] {
  const out: string[] = []
  if (!v.name.trim()) out.push('The group needs a name.')
  // http:// is accepted on purpose: the API takes any URL, and requiring https would
  // block every other edit to a group whose stored website is http.
  if (v.website.trim() && !/^https?:\/\/\S+\.\S+/.test(v.website.trim()))
    out.push('The website must be a full address, starting with https:// (or http://).')
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) out.push('The email address doesn’t look right.')
  const before = v.lettersSentBefore.trim()
  if (before && !(/^\d+$/.test(before) && Number.isSafeInteger(Number(before)))) out.push('Letters sent before joining must be a whole number, 0 or more.')
  return out
}

function changes(g: Chapter, initial: FormValues, v: FormValues, services: Set<ChapterService>): GroupFields {
  const out: GroupFields = {}
  const text = (s: string) => s.trim() || null
  if (v.name.trim() !== initial.name.trim()) out.name = v.name.trim()
  for (const key of ['subregion', 'country', 'about', 'announcement', 'website', 'email'] as const)
    if (v[key].trim() !== initial[key].trim()) out[key] = text(v[key])
  const location = buildLocation(g.location ?? {}, v)
  if (JSON.stringify(location) !== JSON.stringify(buildLocation(g.location ?? {}, initial))) out.location = location
  const social = buildSocial(v)
  if (JSON.stringify(social) !== JSON.stringify(buildSocial(initial))) out.socialLinks = Object.keys(social).length ? social : null
  const was = [...(g.services ?? [])].sort().join()
  if ([...services].sort().join() !== was) out.services = SERVICES.filter((s) => services.has(s))
  if (v.networkRole !== initial.networkRole) out.networkRole = v.networkRole
  if (v.accountStatus !== initial.accountStatus) out.accountStatus = v.accountStatus
  if (v.recordStatus !== initial.recordStatus) out.recordStatus = v.recordStatus as RecordStatus
  if (v.vouchedBy !== initial.vouchedBy) out.vouchedBy = v.vouchedBy ? Number(v.vouchedBy) : null
  if (v.lettersSentBefore.trim() !== initial.lettersSentBefore.trim()) out.lettersSentBefore = Number(v.lettersSentBefore.trim() || 0)
  return out
}

export default function EditGroup() {
  const id = Number(useParams().id)
  const group = useApi(() => getGroup(id, true), [id])
  // Every group, for "vouched for by" (and nothing else on the page needs them).
  const groups = useApi(() => getAllGroups({ sort: 'name' }), [])
  const [saved, setSaved] = useState(false)
  // How many facilities it relays for now: the panel below changes it without a reload.
  const [relayCount, setRelayCount] = useState<number | null>(null)

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">
          <Link to="/admin/groups">Groups</Link> / {group.data?.name ?? 'Group'}
        </span>
        {group.data?.recordStatus === 'published' && (
          <span className="topbar-right">
            <Link to={`/groups/${id}`}>View public page</Link>
          </span>
        )}
      </div>

      <div className="admin-content">
        {group.loading && <p className="dash-note">Loading the group…</p>}
        {group.error && (
          <div className="admin-alert admin-alert-err">
            {group.error.status === 404 ? `There is no group #${id}.` : `Couldn't load group #${id} (${group.error.message}).`}
            {group.error.status !== 404 && (
              <button type="button" className="a-btn a-btn-sm" onClick={group.reload}>
                Try again
              </button>
            )}
          </div>
        )}
        {saved && <div className="admin-alert admin-alert-ok">Saved.</div>}
        {group.data && (
          <>
            <GroupForm
              key={group.data.updatedAt}
              group={group.data}
              others={(groups.data ?? []).filter((g) => g.id !== id)}
              relayCount={relayCount ?? group.data.relay_prisons?.length ?? 0}
              onSaved={() => {
                setSaved(true)
                group.reload()
              }}
              onEdit={() => setSaved(false)}
            />
            {/* Keyed on id only: a link change mustn't reload the record and drop unsaved form edits. */}
            <RelayFacilities key={`relay-${group.data.id}`} group={group.data} onCount={setRelayCount} />
            <SupportedPrisoners key={`support-${group.data.id}`} group={group.data} />
          </>
        )}
      </div>
    </>
  )
}

interface FormProps {
  group: Chapter
  others: Chapter[]
  relayCount: number
  onSaved: () => void
  onEdit: () => void
}

function GroupForm({ group: g, others, relayCount, onSaved, onEdit }: FormProps) {
  const navigate = useNavigate()
  const initial = useMemo(() => toForm(g), [g])
  const [values, setValues] = useState(initial)
  const [services, setServices] = useState(() => new Set(g.services ?? []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const diff = useMemo(() => changes(g, initial, values, services), [g, initial, values, services])
  const dirty = Object.keys(diff).length > 0
  const issues = problems(values)

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  type TextKey = Exclude<keyof FormValues, 'social' | 'networkRole' | 'accountStatus'>
  const set = (patch: Partial<FormValues>) => {
    setValues((v) => ({ ...v, ...patch }))
    onEdit()
  }
  const field = (key: TextKey) => ({
    id: `f-${key}`,
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

  // What the role change means for this group's relay links.
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
      setError(e.errors?.length ? e.errors.join(' ') : e.message)
      setBusy(false)
    }
  }

  async function remove() {
    const typed = window.prompt(
      `Deleting ${g.name} can't be undone. Its members and the writers it manages lose their group, its letters lose their relay group, and its invite codes, invitations and member keys are deleted.\n\nSuspending the group is usually what's wanted.\n\nTo delete it anyway, type its name:`,
    )
    if (typed === null) return
    if (typed.trim() !== g.name) {
      setError('The name didn’t match, so nothing was deleted.')
      return
    }
    onEdit()
    setBusy(true)
    setError(null)
    try {
      await deleteGroup(g.id)
      navigate('/admin/groups', { replace: true })
    } catch (err) {
      setError((err as ApiError).message)
      setBusy(false)
    }
  }

  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty && !busy && issues.length === 0) void save()
      }}
    >
      <Section title="Group">
        <div className="form-row">
          <Field label="Name" htmlFor="f-name">
            <input className="form-input" required {...field('name')} />
          </Field>
          <Field label="Area" htmlFor="f-subregion" hint="City, region or area, as shown publicly: “Portland, OR”.">
            <input className="form-input" {...field('subregion')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Country" htmlFor="f-country">
            <input className="form-input" {...field('country')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Street" htmlFor="f-street" hint="The group’s own address. Optional.">
            <input className="form-input" {...field('street')} />
          </Field>
          <Field label="City" htmlFor="f-city">
            <input className="form-input" {...field('city')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Postal code" htmlFor="f-postalCode">
            <input className="form-input" {...field('postalCode')} />
          </Field>
        </div>
      </Section>

      <Section title="Public profile">
        <Field label="About" htmlFor="f-about">
          <textarea className="form-textarea" rows={4} {...field('about')} />
        </Field>
        <Field label="Announcement" htmlFor="f-announcement" hint="One current announcement, shown on the group’s page.">
          <textarea className="form-textarea short" rows={2} {...field('announcement')} />
        </Field>
        <div className="form-row">
          <Field label="Website" htmlFor="f-website">
            <input type="url" className="form-input" {...field('website')} />
          </Field>
          <Field label="Public email" htmlFor="f-email">
            <input type="email" className="form-input" {...field('email')} />
          </Field>
        </div>
        <div className="form-row social-row">
          {SOCIAL_KEYS.map((k) => (
            <Field key={k} label={SOCIAL[k]} htmlFor={`f-social-${k}`}>
              <input
                id={`f-social-${k}`}
                className="form-input"
                value={values.social[k]}
                disabled={busy}
                onChange={(e) => set({ social: { ...values.social, [k]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
        <div className="form-group">
          <span className="form-label">Services</span>
          <div className="rule-picker">
            {SERVICES.map((s) => (
              <label key={s} className="queue-check">
                <input type="checkbox" checked={services.has(s)} disabled={busy} onChange={() => toggleService(s)} />
                {capitalise(SERVICE_LABELS[s])}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Network">
        <div className="form-row">
          <Field label="Role" htmlFor="f-networkRole">
            <select
              id="f-networkRole"
              className="form-select"
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
          </Field>
          <Field label="Account status" htmlFor="f-accountStatus" hint="Only an active group’s members can send or relay letters, create writers or propose directory changes.">
            <select
              id="f-accountStatus"
              className="form-select"
              value={values.accountStatus}
              disabled={busy}
              onChange={(e) => set({ accountStatus: e.target.value as AccountStatus })}
            >
              {ACCOUNT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {capitalise(s)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {droppingRelay && relayCount > 0 && (
          <div className="admin-alert admin-alert-warn">
            This group is linked as the relay group for {relayCount} {relayCount === 1 ? 'facility' : 'facilities'}. Changing it to collecting only keeps those
            links, and the API still treats a group attached to a facility as relaying; unlink them below if it should stop.
          </div>
        )}
        <div className="form-row">
          <Field label="Record status" htmlFor="f-recordStatus" hint="Only published groups appear in the public directory.">
            <select className="form-select" {...field('recordStatus')}>
              {RECORD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {capitalise(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vouched for by" htmlFor="f-vouchedBy" hint="The group that brought this one into the network.">
            <select className="form-select" {...field('vouchedBy')}>
              <option value="">Nobody</option>
              {values.vouchedBy && !others.some((o) => String(o.id) === values.vouchedBy) && <option value={values.vouchedBy}>Group #{values.vouchedBy}</option>}
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field
            label="Letters sent before joining"
            htmlFor="f-lettersSentBefore"
            hint={`Added to the ${g.lettersCounted ?? 0} letters it has marked mailed here for its public count, which shows from 20.`}
          >
            <input className="form-input" inputMode="numeric" {...field('lettersSentBefore')} />
          </Field>
          <div className="form-group">
            <span className="form-label">Group key</span>
            <p className="form-static">
              {g.publicKey ? `Set (version ${g.keyVersion ?? 1})` : 'Not set up yet.'}
            </p>
            <span className="form-hint">The group’s members set and rotate it themselves; it can’t be changed here.</span>
          </div>
        </div>
      </Section>

      {issues.length > 0 && (
        <div className="admin-alert admin-alert-warn form-error">
          {issues.map((text) => (
            <div key={text}>{text}</div>
          ))}
        </div>
      )}
      {error && <div className="admin-alert admin-alert-err form-error">{error}</div>}

      <div className="admin-form-footer">
        <button type="button" className="a-btn a-btn-danger a-btn-sm" disabled={busy} onClick={() => void remove()}>
          Delete group
        </button>
        <div className="admin-form-footer-actions">
          <Link to="/admin/groups" className="a-btn">
            {dirty ? 'Cancel' : 'Back to list'}
          </Link>
          <button type="submit" className="a-btn a-btn-primary" disabled={!dirty || busy || issues.length > 0}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  )
}

/** Shared by the two link panels: run one link change, report a failure. */
function useLinkAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError((err as ApiError).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

/** The facilities this group prints and mails for. Changes apply at once. */
function RelayFacilities({ group: g, onCount }: { group: Chapter; onCount: (n: number) => void }) {
  const facilities = useApi(() => getAllFacilities({ sort: 'name' }), [])
  const [linked, setLinked] = useState<Prison[]>(() => g.relay_prisons ?? [])
  useEffect(() => onCount(linked.length), [linked, onCount])
  const [choice, setChoice] = useState('')
  const { busy, error, run } = useLinkAction()
  const available = (facilities.data ?? []).filter((f) => !linked.some((l) => l.id === f.id))

  return (
    <div className="admin-form relay-panel">
      <Section title="Relays for">
        <p className="form-hint">
          Facilities this group prints and mails letters for. Linking and unlinking happen straight away, without Save.
          {g.accountStatus !== 'active' && ' While the group isn’t active, it can’t take letters for any of them.'}
        </p>
        {linked.length === 0 ? (
          <p className="form-static">None linked.</p>
        ) : (
          <ul className="relay-list">
            {linked.map((f) => (
              <li key={f.id}>
                <Link to={`/admin/facilities/${f.id}/edit`}>{f.prisonName}</Link>
                {f.country && <span className="list-sub"> {f.country}</span>}
                <button
                  type="button"
                  className="a-btn a-btn-danger a-btn-sm"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Stop ${g.name} relaying for ${f.prisonName}?`))
                      void run(async () => {
                        await unlinkRelayGroup(f.id, g.id)
                        setLinked((l) => l.filter((x) => x.id !== f.id))
                      })
                  }}
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="relay-add">
          <select className="form-select" aria-label="Facility to link" value={choice} disabled={busy || !facilities.data} onChange={(e) => setChoice(e.target.value)}>
            <option value="">{facilities.data ? 'Choose a facility…' : facilities.error ? 'Couldn’t load the facilities' : 'Loading facilities…'}</option>
            {available.map((f) => (
              <option key={f.id} value={f.id}>
                {f.prisonName}
                {f.country ? ` (${f.country})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="a-btn a-btn-sm"
            disabled={!choice || busy}
            onClick={() =>
              void run(async () => {
                await linkRelayGroup(Number(choice), g.id)
                const added = facilities.data?.find((f) => String(f.id) === choice)
                if (added) setLinked((l) => [...l, added].sort((a, b) => a.prisonName.localeCompare(b.prisonName)))
                setChoice('')
              })
            }
          >
            Link facility
          </button>
        </div>
        {error && <div className="admin-alert admin-alert-err">{error}</div>}
      </Section>
    </div>
  )
}

type Supported = Prisoner & { PrisonerSupport?: { description: string | null } }

/** The prisoners this group supports, each with a short public description. Changes apply at once. */
function SupportedPrisoners({ group: g }: { group: Chapter }) {
  const prisoners = useApi(() => getAllPrisoners({ sort: 'name' }), [])
  const [linked, setLinked] = useState<Supported[]>(() => g.supported_prisoners ?? [])
  const [choice, setChoice] = useState('')
  const [description, setDescription] = useState('')
  const { busy, error, run } = useLinkAction()
  const available = (prisoners.data ?? []).filter((p) => !linked.some((l) => l.id === p.id))

  return (
    <div className="admin-form relay-panel">
      <Section title="Supports">
        <p className="form-hint">
          Prisoners this group supports, shown on both their pages with the description. Linking and unlinking happen straight away, without Save.
        </p>
        {linked.length === 0 ? (
          <p className="form-static">None linked.</p>
        ) : (
          <ul className="relay-list">
            {linked.map((p) => (
              <li key={p.id}>
                <Link to={`/admin/prisoners/${p.id}/edit`}>{displayName(p)}</Link>
                {p.PrisonerSupport?.description && <span className="list-sub"> {p.PrisonerSupport.description}</span>}
                <button
                  type="button"
                  className="a-btn a-btn-danger a-btn-sm"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Stop listing ${g.name} as supporting ${displayName(p)}?`))
                      void run(async () => {
                        await unlinkSupportGroup(p.id, g.id)
                        setLinked((l) => l.filter((x) => x.id !== p.id))
                      })
                  }}
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="relay-add">
          <select className="form-select" aria-label="Prisoner to link" value={choice} disabled={busy || !prisoners.data} onChange={(e) => setChoice(e.target.value)}>
            <option value="">{prisoners.data ? 'Choose a prisoner…' : prisoners.error ? 'Couldn’t load the prisoners' : 'Loading prisoners…'}</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
                {p.recordStatus && p.recordStatus !== 'published' ? ` [${p.recordStatus}]` : ''}
              </option>
            ))}
          </select>
          <input
            className="form-input"
            aria-label="Description"
            placeholder="What the group does for them (optional)"
            value={description}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            className="a-btn a-btn-sm"
            disabled={!choice || busy}
            onClick={() =>
              void run(async () => {
                const text = description.trim() || null
                await linkSupportGroup(Number(choice), g.id, text)
                const added = prisoners.data?.find((p) => String(p.id) === choice)
                if (added) setLinked((l) => [...l, { ...added, PrisonerSupport: { description: text } }])
                setChoice('')
                setDescription('')
              })
            }
          >
            Link prisoner
          </button>
        </div>
        {error && <div className="admin-alert admin-alert-err">{error}</div>}
      </Section>
    </div>
  )
}
