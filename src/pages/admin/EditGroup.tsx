import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteGroup, getGroup, getGroups, updateGroup, type GroupFields } from '../../api/groups'
import { getTwoFactorPolicy, setGroupTwoFactor } from '../../api/twoFactor'
import { Field, Section } from '../../components/forms/AdminFormParts'
import RecordPicker from '../../components/forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../../components/forms/recordPickerState'
import { ADMIN_UI } from '../../components/forms/uiClasses'
import RelayFacilitiesPanel from '../../components/group/RelayFacilitiesPanel'
import SupportedPrisonersPanel from '../../components/group/SupportedPrisonersPanel'
import { useLinkAction } from '../../components/group/useLinkAction'
import { useApi } from '../../hooks/useApi'
import type { AccountStatus, ApiError, Chapter, ChapterService, NetworkRole, RecordStatus } from '../../types'
import { SERVICE_LABELS } from '../../utils/groups'
import { capitalise, changes, problems, ROLES, SERVICES, SOCIAL, SOCIAL_KEYS, toForm, type GroupFormValues } from '../../utils/groupForm'

// Edit one group (PUT /chapter/chapter, superadmins only). Only changed fields
// are sent; `location` and `socialLinks` are JSON values, so they go whole. The
// form's shared half is utils/groupForm.ts (a group admin's own page,
// org/OrgSettings.tsx, uses it too); the fields only a site admin sets are here.
// Two kinds of link have their own panels and change at once, apart from Save:
// the facilities the group relays for (PUT/DELETE /prison/relay) and the
// prisoners it supports (PUT/DELETE /prisoner/support), in components/group,
// shared with the group's own settings page. Group keys are set by
// the group's own members through /auth, never here.

const ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended']
const RECORD_STATUSES: RecordStatus[] = ['published', 'pending', 'draft']

/** The shared group form (utils/groupForm.ts) plus the fields only a site admin sets. */
interface FormValues extends GroupFormValues {
  accountStatus: AccountStatus
  recordStatus: string
  vouchedBy: string
}

function toAdminForm(g: Chapter): FormValues {
  return {
    ...toForm(g),
    accountStatus: g.accountStatus,
    recordStatus: g.recordStatus ?? 'published',
    vouchedBy: g.vouchedBy !== null ? String(g.vouchedBy) : '',
  }
}

function adminChanges(g: Chapter, initial: FormValues, v: FormValues, services: Set<ChapterService>): GroupFields {
  const out: GroupFields = changes(g, initial, v, services)
  if (v.accountStatus !== initial.accountStatus) out.accountStatus = v.accountStatus
  if (v.recordStatus !== initial.recordStatus) out.recordStatus = v.recordStatus as RecordStatus
  if (v.vouchedBy !== initial.vouchedBy) out.vouchedBy = v.vouchedBy ? Number(v.vouchedBy) : null
  return out
}

export default function EditGroup() {
  const id = Number(useParams().id)
  const group = useApi(() => getGroup(id, true), [id])
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
              relayCount={relayCount ?? group.data.relay_prisons?.length ?? 0}
              onSaved={() => {
                setSaved(true)
                group.reload()
              }}
              onEdit={() => setSaved(false)}
            />
            {/* Keyed on id only: a link change mustn't reload the record and drop unsaved form edits. */}
            <RelayFacilitiesPanel
              key={`relay-${group.data.id}`}
              group={group.data}
              classes={ADMIN_UI}
              linkTo={(f) => `/admin/facilities/${f.id}/edit`}
              onCount={setRelayCount}
            />
            <SupportedPrisonersPanel
              key={`support-${group.data.id}`}
              group={group.data}
              classes={ADMIN_UI}
              linkTo={(p) => `/admin/prisoners/${p.id}/edit`}
            />
            <GroupTwoFactor key={`2fa-${group.data.id}`} group={group.data} />
          </>
        )}
      </div>
    </>
  )
}

interface FormProps {
  group: Chapter
  relayCount: number
  onSaved: () => void
  onEdit: () => void
}

function GroupForm({ group: g, relayCount, onSaved, onEdit }: FormProps) {
  const navigate = useNavigate()
  const initial = useMemo(() => toAdminForm(g), [g])
  const [values, setValues] = useState(initial)
  const [services, setServices] = useState(() => new Set(g.services ?? []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Activating a pending group publishes it too, as the groups list's Approve
  // does, unless the admin chose the record status themselves: an active group
  // left unpublished stays out of the public directory with nothing saying so.
  const [recordChosen, setRecordChosen] = useState(false)
  const [publishedWithActivation, setPublishedWithActivation] = useState(false)
  // "Vouched for by": the stored group's name, fetched by id; another is found with the picker.
  const storedVoucher = useApi(() => (g.vouchedBy !== null ? getGroup(g.vouchedBy, false) : Promise.resolve(null)), [g.vouchedBy])
  const [pickedVoucher, setPickedVoucher] = useState<Chapter | null>(null)
  const voucherName = !values.vouchedBy
    ? 'Nobody'
    : ([pickedVoucher, storedVoucher.data].find((o) => o && String(o.id) === values.vouchedBy)?.name ?? `Group #${values.vouchedBy}`)

  const diff = useMemo(() => adminChanges(g, initial, values, services), [g, initial, values, services])
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
              onChange={(e) => {
                const accountStatus = e.target.value as AccountStatus
                const activating = initial.accountStatus === 'pending' && accountStatus === 'active'
                if (recordChosen) set({ accountStatus })
                else if (activating && values.recordStatus !== 'published') {
                  set({ accountStatus, recordStatus: 'published' })
                  setPublishedWithActivation(true)
                } else if (publishedWithActivation && !activating) {
                  // Not activating after all: the record status goes back to what it was.
                  set({ accountStatus, recordStatus: initial.recordStatus })
                  setPublishedWithActivation(false)
                } else set({ accountStatus })
              }}
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
          <Field
            label="Record status"
            htmlFor="f-recordStatus"
            hint={
              publishedWithActivation
                ? 'Set to published with activating the group, as Approve on the groups list does: an active group that isn’t published stays out of the public directory. Change it if it should.'
                : 'Only published groups appear in the public directory.'
            }
          >
            <select
              className="form-select"
              {...field('recordStatus')}
              onChange={(e) => {
                set({ recordStatus: e.target.value })
                setRecordChosen(true)
                setPublishedWithActivation(false)
              }}
            >
              {RECORD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {capitalise(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vouched for by" htmlFor="f-vouchedBy" hint="The group that brought this one into the network.">
            <div className="relay-add" style={{ marginBottom: '0.4rem' }}>
              <span className="form-static">{voucherName}</span>
              {values.vouchedBy && (
                <button type="button" className="a-btn a-btn-sm" disabled={busy} onClick={() => set({ vouchedBy: '' })}>
                  Clear
                </button>
              )}
            </div>
            <RecordPicker
              id="f-vouchedBy"
              label="Vouched for by"
              classes={{ input: 'form-input' }}
              placeholder="Search groups to change it…"
              disabled={busy}
              fetch={(q) => getGroups({ q, sort: 'name', page_size: PICKER_PAGE_SIZE })}
              exclude={[g.id]}
              render={(o) => o.name}
              onSelect={(o) => {
                setPickedVoucher(o)
                set({ vouchedBy: String(o.id) })
              }}
            />
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

/**
 * Whether this group's admins must use two-factor sign-in (PUT /auth/two-factor/group).
 * Applies at once, like the link panels, and keeps its own state, so unsaved
 * edits in the form above survive. The site-wide switches are on Site settings.
 */
function GroupTwoFactor({ group: g }: { group: Chapter }) {
  const [required, setRequired] = useState(Boolean(g.requireTwoFactor))
  // "Every group's admins" overrides this group's own setting while it's on.
  const policy = useApi(getTwoFactorPolicy, [])
  const { busy, error, run } = useLinkAction()

  function toggle(on: boolean) {
    const question = on
      ? `Require two-factor sign-in of ${g.name}’s admins? Any who haven’t set it up must do so before anything else works, from their next request.`
      : `Stop requiring two-factor sign-in of ${g.name}’s admins? Those who have it on keep it.`
    if (!window.confirm(question)) return
    void run(async () => {
      const answer = await setGroupTwoFactor(g.id, on)
      setRequired(answer.required)
    })
  }

  return (
    <div className="admin-form relay-panel">
      <Section title="Two-factor sign-in">
        <p className="form-hint">
          Require this group’s admins to use a code from an authenticator app when they sign in. This applies straight away, without Save. The
          site-wide switches are on <Link to="/admin/settings">Site settings</Link>.
        </p>
        <label className="queue-check">
          <input type="checkbox" checked={required} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
          Require it of this group’s admins
        </label>
        {policy.data?.allGroups && (
          <p className="form-hint">
            It’s required of every group’s admins at the moment, so this group’s admins must use it whatever this says.
          </p>
        )}
        {error && <div className="admin-alert admin-alert-err">{error}</div>}
      </Section>
    </div>
  )
}
