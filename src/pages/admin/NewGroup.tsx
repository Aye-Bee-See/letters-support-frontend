import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createGroup } from '../../api/admin'
import { getGroups, type GroupFields } from '../../api/groups'
import { Field, Section } from '../../components/forms/AdminFormParts'
import RecordPicker from '../../components/forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../../components/forms/recordPickerState'
import type { AccountStatus, ApiError, Chapter, ChapterService, NetworkRole, RecordStatus, SocialLinkKey } from '../../types'
import { buildLocation, buildSocial, capitalise, problems, RECORD_STATUSES, ROLES, SERVICES, SOCIAL, SOCIAL_KEYS, type GroupFormValues } from '../../utils/groupForm'
import { SERVICE_LABELS } from '../../utils/groups'
import { siteAdminRefusal } from '../../utils/refusals'

// A group made directly (POST /chapter/chapter, superadmins only), rather than
// by an invitation or approving a proposal. The shared half of the form and its
// checks are utils/groupForm.ts, as on the edit page; the fields only a site
// admin sets (account status, record status, vouched for by) are built here
// alongside EditGroup.tsx's, which aren't exported. The new group has no
// members and no key: its first group admin is invited, or put in it from
// their account's page, and sets the key up. Relay facilities and supported
// prisoners are linked on the edit page once it exists. A new record is a
// draft unless chosen otherwise: published makes it public at once.

const ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended']

interface Values extends GroupFormValues {
  accountStatus: AccountStatus
  recordStatus: RecordStatus
  vouchedBy: string
}

const EMPTY: Values = {
  name: '', street: '', city: '', postalCode: '', subregion: '', country: '', about: '', announcement: '', website: '', email: '',
  social: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, ''])) as Record<SocialLinkKey, string>,
  networkRole: 'collecting', lettersSentBefore: '0', accountStatus: 'pending', recordStatus: 'draft', vouchedBy: '',
}

/** The API body: only what was filled in. */
function body(v: Values, services: Set<ChapterService>): GroupFields & { name: string; location: Record<string, string> } {
  const out: GroupFields & { name: string; location: Record<string, string> } = {
    name: v.name.trim(),
    location: buildLocation({}, v),
    networkRole: v.networkRole,
    accountStatus: v.accountStatus,
    recordStatus: v.recordStatus,
  }
  for (const key of ['subregion', 'country', 'about', 'announcement', 'website', 'email'] as const) if (v[key].trim()) out[key] = v[key].trim()
  const social = buildSocial(v)
  if (Object.keys(social).length) out.socialLinks = social
  if (services.size) out.services = SERVICES.filter((s) => services.has(s))
  if (Number(v.lettersSentBefore.trim() || 0) > 0) out.lettersSentBefore = Number(v.lettersSentBefore.trim())
  if (v.vouchedBy) out.vouchedBy = Number(v.vouchedBy)
  return out
}

export default function NewGroup() {
  const navigate = useNavigate()
  // The group found with the picker; `values.vouchedBy` is its id.
  const [voucher, setVoucher] = useState<Chapter | null>(null)
  const [values, setValues] = useState(EMPTY)
  const [services, setServices] = useState<Set<ChapterService>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const issues = problems(values)

  const set = (patch: Partial<Values>) => {
    setValues((v) => ({ ...v, ...patch }))
    setError(null)
  }
  type TextKey = Exclude<keyof Values, 'social' | 'networkRole' | 'accountStatus' | 'recordStatus'>
  const field = (key: TextKey) => ({
    id: `f-${key}`,
    value: values[key],
    disabled: busy,
    onChange: (e: { target: { value: string } }) => set({ [key]: e.target.value }),
  })
  const toggleService = (s: ChapterService) =>
    setServices((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const made = await createGroup(body(values, services))
      navigate(`/admin/groups/${made.id}/edit`, { replace: true })
    } catch (err) {
      setError(siteAdminRefusal(err as ApiError))
      setBusy(false)
    }
  }

  return (
    <>
      <title>New group · Admin · letters.support</title>
      <div className="admin-topbar">
        <span className="topbar-title">
          <Link to="/admin/groups">Groups</Link> / New group
        </span>
      </div>

      <div className="admin-content">
        <p className="dash-note">
          Most groups join by <Link to="/admin/invite">invitation</Link>, which brings their first group admin with them. A group made here has no group admins and
          no key yet: invite its first group admin, or put an existing account in it from the account’s page; they set the group key up.
        </p>
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && issues.length === 0) void save()
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
                <select id="f-networkRole" className="form-select" value={values.networkRole} disabled={busy} onChange={(e) => set({ networkRole: e.target.value as NetworkRole })}>
                  {(Object.keys(ROLES) as NetworkRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLES[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Account status" htmlFor="f-accountStatus" hint="Only an active group’s group admins can send or relay letters, create writers or propose directory changes.">
                <select id="f-accountStatus" className="form-select" value={values.accountStatus} disabled={busy} onChange={(e) => set({ accountStatus: e.target.value as AccountStatus })}>
                  {ACCOUNT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {capitalise(s)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="form-row">
              <Field
                label="Record status"
                htmlFor="f-recordStatus"
                hint={values.recordStatus === 'published' ? 'Published makes the group public at once, in the directory.' : 'Only published groups appear in the public directory.'}
              >
                <select id="f-recordStatus" className="form-select" value={values.recordStatus} disabled={busy} onChange={(e) => set({ recordStatus: e.target.value as RecordStatus })}>
                  {RECORD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {capitalise(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Vouched for by" htmlFor="f-vouchedBy" hint="The group that brought this one into the network.">
                <div className="relay-add picked-row">
                  <span className="form-static">{voucher && values.vouchedBy ? voucher.name : 'Nobody'}</span>
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
                  placeholder="Search groups…"
                  disabled={busy}
                  fetch={(q) => getGroups({ q, sort: 'name', page_size: PICKER_PAGE_SIZE })}
                  exclude={values.vouchedBy ? [Number(values.vouchedBy)] : null}
                  render={(o) => o.name}
                  onSelect={(o) => {
                    setVoucher(o)
                    set({ vouchedBy: String(o.id) })
                  }}
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Letters sent before joining" htmlFor="f-lettersSentBefore" hint="Counted towards its public total, which shows from 20.">
                <input className="form-input" inputMode="numeric" {...field('lettersSentBefore')} />
              </Field>
            </div>
          </Section>

          {issues.length > 0 && (
            <div className="admin-alert admin-alert-warn form-error" role="status">
              {issues.map((text) => (
                <div key={text}>{text}</div>
              ))}
            </div>
          )}
          {error && <div className="admin-alert admin-alert-err form-error" role="alert">{error}</div>}

          <div className="admin-form-footer">
            <span />
            <div className="admin-form-footer-actions">
              <Link to="/admin/groups" className="a-btn">
                Cancel
              </Link>
              <button type="submit" className="a-btn a-btn-primary" disabled={busy || issues.length > 0}>
                {busy ? 'Saving…' : values.recordStatus === 'published' ? 'Make and publish' : 'Make the group'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}
