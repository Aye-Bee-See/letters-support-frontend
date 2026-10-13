import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createFacility } from '../../api/admin'
import { getMailRules } from '../../api/facilities'
import RulePicker from '../../components/admin/RulePicker'
import { Field, Section } from '../../components/forms/AdminFormParts'
import { useApi } from '../../hooks/useApi'
import type { ApiError, RecordStatus } from '../../types'
import { ROUTING_LABELS } from '../../utils/facilities'
import { EMPTY_FACILITY, languageHint, MAX_PRINT_LINES, problems, RECORD_STATUSES, ROUTINGS, toRecord, type FacilityFormValues } from '../../utils/facilityForm'
import { refusalText, siteAdminRefusal } from '../../utils/refusals'

// A facility made directly (POST /prison/prison, superadmins only), rather than
// by approving a group's proposal. The same fields, checks and rule picker as
// the edit page, EditFacility.tsx (utils/facilityForm.ts,
// components/admin/RulePicker.tsx), laid out from the same parts
// (AdminFormParts); a change to the fields belongs in both. Relay groups are
// linked on the edit page once the facility exists. A new record is a draft
// unless chosen otherwise: published makes it public at once.

export default function NewFacility() {
  const navigate = useNavigate()
  // Current rules only: the API refuses a retired one on a facility that doesn't already have it.
  const rules = useApi(() => getMailRules(), [])
  const [values, setValues] = useState(EMPTY_FACILITY)
  const [verified, setVerified] = useState(false)
  const [ruleTags, setRuleTags] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = rules.data
  const issues = problems(values, ruleTags, list)

  const set = <K extends keyof FacilityFormValues>(key: K, value: FacilityFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setError(null)
  }
  const field = (key: Exclude<keyof FacilityFormValues, 'recordStatus'>) => ({
    id: `f-${key}`,
    value: values[key],
    disabled: busy,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  })
  const toggleRule = (tag: string) =>
    setRuleTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const made = await createFacility({
        ...toRecord(values, ruleTags, list),
        // verifiedBy names a group; a superadmin has none.
        ...(verified ? { verifiedAt: new Date().toISOString() } : {}),
      })
      navigate(`/admin/facilities/${made.id}/edit`, { replace: true })
    } catch (err) {
      setError(siteAdminRefusal(err as ApiError))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">
          <Link to="/admin/facilities">Facilities</Link> / New facility
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
          <Section title="Facility">
            <div className="form-row">
              <Field label="Name" htmlFor="f-prisonName">
                <input className="form-input" required {...field('prisonName')} />
              </Field>
              <Field label="Country" htmlFor="f-country">
                <input className="form-input" {...field('country')} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="f-notes" hint="Shown on the public page.">
              <textarea className="form-textarea short" rows={3} {...field('notes')} />
            </Field>
          </Section>

          <Section title="Address">
            <div className="form-row">
              <Field label="Street" htmlFor="f-street">
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
            <Field
              label="Print lines"
              htmlFor="f-lines"
              hint={`Optional. The exact lines to write on the envelope, in order, one per line (at most ${MAX_PRINT_LINES}). When set, these are printed instead of the fields above.`}
            >
              <textarea className="form-textarea short" rows={4} {...field('lines')} />
            </Field>
          </Section>

          <Section title="Mail">
            <div className="form-row">
              <Field label="Routing" htmlFor="f-routing" hint="How letters reach the facility.">
                <select className="form-select" {...field('routing')}>
                  <option value="">Not set</option>
                  {ROUTINGS.map((r) => (
                    <option key={r} value={r}>
                      {ROUTING_LABELS[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Mail languages" htmlFor="f-mailLanguages" hint={languageHint(values.mailLanguages) || 'Two-letter codes, e.g. “en, es”. Blank for no restriction.'}>
                <input className="form-input" {...field('mailLanguages')} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Page limit" htmlFor="f-pageLimit" hint="Single-sided pages per letter. Blank for no limit.">
                <input className="form-input" inputMode="numeric" {...field('pageLimit')} />
              </Field>
              <Field label="Photo limit" htmlFor="f-photoLimit" hint="Loose photos per envelope. Blank for no stated limit.">
                <input className="form-input" inputMode="numeric" {...field('photoLimit')} />
              </Field>
            </div>
            <Field label="Scan service" htmlFor="f-scanService" hint="For facilities that take mail through a scanning service.">
              <textarea className="form-textarea short" rows={2} {...field('scanService')} />
            </Field>
            <div className="form-group">
              <span className="form-label">Mail rules</span>
              {rules.loading && <p className="form-hint">Loading the list of rules…</p>}
              {rules.error && <p className="form-hint">Couldn't load the list of rules ({refusalText(rules.error)}).</p>}
              {list && <RulePicker list={list} selected={ruleTags} disabled={busy} onToggle={toggleRule} />}
            </div>
            <p className="form-hint">Relay groups are linked on the facility’s edit page, once it exists.</p>
          </Section>

          <Section title="Publishing and verification">
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
              <Link to="/admin/facilities" className="a-btn">
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
