import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createPrisoner } from '../../api/admin'
import { getFacilities } from '../../api/facilities'
import { Field, Section } from '../../components/forms/AdminFormParts'
import RecordPicker from '../../components/forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../../components/forms/recordPickerState'
import type { ApiError, Prison, RecordStatus } from '../../types'
import { STATUS_LABELS } from '../../utils/prisoners'
import { EMPTY_PRISONER, facilityLabel, PRISONER_STATUSES, problems, RECORD_STATUSES, toRecord, type PrisonerFormValues } from '../../utils/prisonerForm'
import { siteAdminRefusal } from '../../utils/users'

// A prisoner record made directly (POST /prisoner/prisoner, superadmins only),
// rather than by approving a group's proposal. The same fields and checks as
// the edit page, EditPrisoner.tsx (utils/prisonerForm.ts), laid out from the
// same parts (AdminFormParts); a change to the fields belongs in both. A new
// record is a draft unless chosen otherwise: published makes it public at
// once. Then the new record's edit page.

export default function NewPrisoner() {
  const navigate = useNavigate()
  // The facility found with the picker; `values.prison` is its id.
  const [facility, setFacility] = useState<Prison | null>(null)
  const [values, setValues] = useState(EMPTY_PRISONER)
  const [verified, setVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const issues = problems(values)

  const set = <K extends keyof PrisonerFormValues>(key: K, value: PrisonerFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setError(null)
  }
  const field = (key: Exclude<keyof PrisonerFormValues, 'featured' | 'recordStatus'>) => ({
    id: `f-${key}`,
    value: values[key],
    disabled: busy,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  })

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const made = await createPrisoner({
        ...toRecord(values),
        // verifiedBy names a group; a superadmin has none.
        ...(verified ? { verifiedAt: new Date().toISOString() } : {}),
      })
      navigate(`/admin/prisoners/${made.id}/edit`, { replace: true })
    } catch (err) {
      setError(siteAdminRefusal(err as ApiError))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">
          <Link to="/admin/prisoners">Prisoners</Link> / New prisoner
        </span>
      </div>

      <div className="admin-content">
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && issues.length === 0) void save()
          }}
        >
          <Section title="Name">
            <div className="form-row">
              <Field label="Chosen name" htmlFor="f-chosenName" hint="The name they go by. Shown first everywhere.">
                <input className="form-input" {...field('chosenName')} />
              </Field>
              <Field label="Birth name" htmlFor="f-birthName">
                <input className="form-input" {...field('birthName')} />
              </Field>
            </div>
            <Field label="Other names" htmlFor="f-aliases" hint="One per line.">
              <textarea className="form-textarea short" rows={2} {...field('aliases')} />
            </Field>
          </Section>

          <Section title="Custody">
            <div className="form-row">
              <Field label="Status" htmlFor="f-status">
                <select className="form-select" {...field('status')}>
                  <option value="">Not set</option>
                  {PRISONER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Facility" htmlFor="f-prison">
                <div className="relay-add" style={{ marginBottom: '0.4rem' }}>
                  <span className="form-static">{facility && values.prison ? facilityLabel(facility) : 'Not listed'}</span>
                  {values.prison && (
                    <button type="button" className="a-btn a-btn-sm" disabled={busy} onClick={() => set('prison', '')}>
                      Clear
                    </button>
                  )}
                </div>
                <RecordPicker
                  id="f-prison"
                  label="Facility"
                  classes={{ input: 'form-input' }}
                  placeholder="Search facilities…"
                  disabled={busy}
                  fetch={(q) => getFacilities({ q, sort: 'name', page_size: PICKER_PAGE_SIZE })}
                  exclude={values.prison ? [Number(values.prison)] : null}
                  render={facilityLabel}
                  onSelect={(f) => {
                    setFacility(f)
                    set('prison', String(f.id))
                    // The facility's country, when none is typed yet.
                    if (f.country) setValues((v) => (v.country.trim() ? v : { ...v, country: f.country ?? '' }))
                  }}
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Country" htmlFor="f-country">
                <input className="form-input" {...field('country')} />
              </Field>
              <Field label="Inmate ID" htmlFor="f-inmateID">
                <input className="form-input" {...field('inmateID')} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Detained since" htmlFor="f-detainedSince">
                <input type="date" className="form-input" {...field('detainedSince')} />
              </Field>
              <Field label="Release date" htmlFor="f-releaseDate" hint="When it is known exactly.">
                <input type="date" className="form-input" {...field('releaseDate')} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Estimated release" htmlFor="f-estimatedRelease" hint="Free text, shown instead of the release date: “Late 2027”.">
                <input className="form-input" {...field('estimatedRelease')} />
              </Field>
              <Field label="Sentence" htmlFor="f-sentence">
                <input className="form-input" {...field('sentence')} />
              </Field>
            </div>
            <Field label="Charges" htmlFor="f-charges">
              <textarea className="form-textarea short" rows={2} {...field('charges')} />
            </Field>
            <Field label="Status notice" htmlFor="f-statusNotice" hint="A short notice shown on their profile, e.g. a recent transfer.">
              <input className="form-input" {...field('statusNotice')} />
            </Field>
          </Section>

          <Section title="Profile">
            <Field label="Bio" htmlFor="f-bio">
              <textarea className="form-textarea" rows={5} {...field('bio')} />
            </Field>
            <Field label="Interests" htmlFor="f-interests" hint="One per line.">
              <textarea className="form-textarea short" rows={3} {...field('interests')} />
            </Field>
            <div className="form-row">
              <Field label="Support website" htmlFor="f-supportWebsite" hint="A full URL, including https://.">
                <input type="url" className="form-input" {...field('supportWebsite')} />
              </Field>
              <Field label="Donation information" htmlFor="f-donationInfo">
                <textarea className="form-textarea short" rows={2} {...field('donationInfo')} />
              </Field>
            </div>
          </Section>

          <Section title="Publishing and verification">
            <div className="form-row">
              <Field
                label="Record status"
                htmlFor="f-recordStatus"
                hint={values.recordStatus === 'published' ? 'Published makes the record public at once, in the directory and to every writer.' : 'Only published records appear in the public directory.'}
              >
                <select id="f-recordStatus" className="form-select" value={values.recordStatus} disabled={busy} onChange={(e) => set('recordStatus', e.target.value as RecordStatus)}>
                  {RECORD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-group">
                <span className="form-label">Front page</span>
                <label className="queue-check">
                  <input type="checkbox" checked={values.featured} disabled={busy} onChange={(e) => set('featured', e.target.checked)} />
                  Feature on the front page
                </label>
              </div>
            </div>
            <div className="form-group">
              <label className="queue-check">
                <input
                  type="checkbox"
                  checked={verified}
                  disabled={busy}
                  onChange={(e) => {
                    setVerified(e.target.checked)
                    setError(null)
                  }}
                />
                I have checked these details: mark the record verified today
              </label>
            </div>
            <Field label="Verification notes" htmlFor="f-verificationNotes" hint="Staff only. Where the details come from, and anything in doubt.">
              <textarea className="form-textarea short" rows={3} {...field('verificationNotes')} />
            </Field>
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
              <Link to="/admin/prisoners" className="a-btn">
                Cancel
              </Link>
              <button type="submit" className="a-btn a-btn-primary" disabled={busy || issues.length > 0}>
                {busy ? 'Saving…' : values.recordStatus === 'published' ? 'Make and publish' : 'Make the record'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}
