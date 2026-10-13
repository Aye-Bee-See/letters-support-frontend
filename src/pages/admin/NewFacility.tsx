import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createFacility } from '../../api/admin'
import { getMailRules, type FacilityFields } from '../../api/facilities'
import { Field, Section } from '../../components/forms/AdminFormParts'
import { useApi } from '../../hooks/useApi'
import type { ApiError, MailRuleCategory, MailRuleList, PrisonAddress, RecordStatus, RoutingMethod } from '../../types'
import { ROUTING_LABELS } from '../../utils/facilities'
import { siteAdminRefusal } from '../../utils/users'
import { refusalText } from '../../utils/refusals'

// A facility made directly (POST /prison/prison, superadmins only), rather than
// by approving a group's proposal. The same fields as the edit page,
// EditFacility.tsx, whose form, checks and rule picker are its own and not
// exported, so these are built alongside them from the same parts
// (AdminFormParts); a change to the fields belongs in both. Relay groups are
// linked on the edit page once the facility exists. A new record is a draft
// unless chosen otherwise: published makes it public at once.

const ROUTINGS = Object.keys(ROUTING_LABELS) as RoutingMethod[]
const RECORD_STATUSES: RecordStatus[] = ['draft', 'pending', 'published']
const MAX_PRINT_LINES = 8
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })

interface Values {
  prisonName: string
  street: string
  city: string
  postalCode: string
  lines: string
  country: string
  routing: string
  scanService: string
  pageLimit: string
  photoLimit: string
  mailLanguages: string
  notes: string
  recordStatus: RecordStatus
  verified: boolean
  verificationNotes: string
}

const EMPTY: Values = {
  prisonName: '', street: '', city: '', postalCode: '', lines: '', country: '', routing: '', scanService: '', pageLimit: '',
  photoLimit: '', mailLanguages: '', notes: '', recordStatus: 'draft', verified: false, verificationNotes: '',
}

const toLines = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
const toCodes = (text: string) =>
  text
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)

/** What the API would refuse, said before sending (as EditFacility's checks), and an address to mail to. */
function problems(v: Values, rules: Set<string>, list: MailRuleList | null): string[] {
  const out: string[] = []
  if (!v.prisonName.trim()) out.push('The facility needs a name.')
  if (!v.city.trim() && !toLines(v.lines).length) out.push('Give the address: at least the city, or the lines to print on an envelope.')
  if (toLines(v.lines).length > MAX_PRINT_LINES) out.push(`An envelope takes at most ${MAX_PRINT_LINES} print lines.`)
  for (const [key, label] of [['pageLimit', 'Page limit'], ['photoLimit', 'Photo limit']] as const) {
    const raw = v[key].trim()
    if (raw && !(/^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) >= 1))
      out.push(`${label} must be a whole number of at least 1, or blank for no limit.`)
  }
  if (v.photoLimit.trim() && rules.has('no_photos')) {
    const label = list?.rules.find((r) => r.tag === 'no_photos')?.label ?? 'No photos'
    out.push(`A facility with “${label}” takes no photos, so it can’t have a photo limit: clear one or the other.`)
  }
  const codes = toCodes(v.mailLanguages)
  const bad = codes.filter((c) => !/^[a-z]{2}$/.test(c))
  if (bad.length) out.push(`Languages are two-letter codes, like en or es: ${bad.join(', ')} isn't one.`)
  if (new Set(codes).size !== codes.length) out.push('A language is listed twice.')
  for (const [a, b] of list?.conflicts ?? []) {
    if (rules.has(a) && rules.has(b)) {
      const label = (tag: string) => list?.rules.find((r) => r.tag === tag)?.label ?? tag
      out.push(`“${label(a)}” and “${label(b)}” can’t both apply.`)
    }
  }
  return out
}

/** The API body: only what was filled in; rules in master-list order. */
function body(v: Values, rules: Set<string>, list: MailRuleList | null): FacilityFields & { prisonName: string; address: PrisonAddress } {
  const address: PrisonAddress = {}
  if (v.street.trim()) address.street = v.street.trim()
  if (v.city.trim()) address.city = v.city.trim()
  if (v.postalCode.trim()) address.postalCode = v.postalCode.trim()
  if (toLines(v.lines).length) address.lines = toLines(v.lines)
  const out: FacilityFields & { prisonName: string; address: PrisonAddress } = { prisonName: v.prisonName.trim(), address, recordStatus: v.recordStatus }
  for (const key of ['country', 'scanService', 'notes', 'verificationNotes'] as const) if (v[key].trim()) out[key] = v[key].trim()
  if (v.routing) out.routing = v.routing as RoutingMethod
  for (const key of ['pageLimit', 'photoLimit'] as const) if (v[key].trim()) out[key] = Number(v[key])
  if (toCodes(v.mailLanguages).length) out.mailLanguages = toCodes(v.mailLanguages)
  const order = list?.rules.map((r) => r.tag) ?? []
  if (rules.size) out.mailRules = [...rules].sort((a, b) => (order.indexOf(a) + 1 || Infinity) - (order.indexOf(b) + 1 || Infinity))
  // verifiedBy names a group; a superadmin has none.
  if (v.verified) out.verifiedAt = new Date().toISOString()
  return out
}

export default function NewFacility() {
  const navigate = useNavigate()
  // Current rules only: the API refuses a retired one on a facility that doesn't already have it.
  const rules = useApi(() => getMailRules(), [])
  const [values, setValues] = useState(EMPTY)
  const [ruleTags, setRuleTags] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = rules.data
  const issues = problems(values, ruleTags, list)

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setError(null)
  }
  const field = (key: Exclude<keyof Values, 'verified' | 'recordStatus'>) => ({
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

  const languageHint = toCodes(values.mailLanguages)
    .filter((c) => /^[a-z]{2}$/.test(c))
    .map((c) => languageNames.of(c) ?? c)
    .join(', ')

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const made = await createFacility(body(values, ruleTags, list))
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
              <Field label="Mail languages" htmlFor="f-mailLanguages" hint={languageHint || 'Two-letter codes, e.g. “en, es”. Blank for no restriction.'}>
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
                <input type="checkbox" checked={values.verified} disabled={busy} onChange={(e) => set('verified', e.target.checked)} />
                I have checked these details: mark the record verified today
              </label>
            </div>
            <Field label="Verification notes" htmlFor="f-verificationNotes" hint="Staff only. Where the details come from, and anything in doubt.">
              <textarea className="form-textarea short" rows={3} {...field('verificationNotes')} />
            </Field>
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

const categoryLabel = (c: MailRuleCategory) => (c.charAt(0).toUpperCase() + c.slice(1)).replace(/_/g, ' ')

/** The master list by category, retired rules left out (as EditFacility's picker, for a facility with none yet). */
function RulePicker(props: { list: MailRuleList; selected: Set<string>; disabled: boolean; onToggle: (tag: string) => void }) {
  const { list, selected, disabled, onToggle } = props
  return (
    <div className="rule-picker">
      {list.categories.map((category) => {
        const inCategory = list.rules.filter((r) => r.category === category && !r.retired)
        if (!inCategory.length) return null
        return (
          <fieldset key={category} className="rule-group">
            <legend className="form-hint">{categoryLabel(category)}</legend>
            {inCategory.map((rule) => (
              <label key={rule.tag} className="queue-check" title={rule.description ?? undefined}>
                <input type="checkbox" checked={selected.has(rule.tag)} disabled={disabled} onChange={() => onToggle(rule.tag)} />
                {rule.label}
              </label>
            ))}
          </fieldset>
        )
      })}
    </div>
  )
}
