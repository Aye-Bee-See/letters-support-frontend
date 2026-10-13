import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deleteFacility,
  getFacility,
  getMailRules,
  linkRelayGroup,
  unlinkRelayGroup,
  updateFacility,
  type FacilityFields,
} from '../../api/facilities'
import { getGroups } from '../../api/groups'
import RecordHistory from '../../components/admin/RecordHistory'
import { Field, Section } from '../../components/forms/AdminFormParts'
import RecordPicker from '../../components/forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../../components/forms/recordPickerState'
import { useApi } from '../../hooks/useApi'
import type { ApiError, Chapter, MailRuleCategory, MailRuleList, Prison, PrisonAddress, RecordStatus, RoutingMethod } from '../../types'
import { isStale, ROUTING_LABELS } from '../../utils/facilities'
import { shortDate } from '../../utils/prisoners'

// Edit one facility record (PUT /prison/prison, superadmins only). Only changed
// fields are sent, so the audit log says what was edited; `address` is one JSON
// value, so it goes whole. Relay groups are links of their own (PUT and DELETE
// /prison/relay) and change at once, apart from Save. Unlike a prisoner's, a
// facility's edits don't touch queued letters.

const ROUTINGS = Object.keys(ROUTING_LABELS) as RoutingMethod[]
const RECORD_STATUSES: RecordStatus[] = ['published', 'pending', 'draft']
/** address keys the form edits; any others the record has are kept as they are. */
const ADDRESS_KEYS = ['street', 'city', 'postalCode', 'lines']
const MAX_PRINT_LINES = 8
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })

interface FormValues {
  prisonName: string
  street: string
  city: string
  postalCode: string
  /** One print line per line of text. */
  lines: string
  country: string
  routing: string
  scanService: string
  pageLimit: string
  photoLimit: string
  /** Two-letter codes, separated by commas or spaces. */
  mailLanguages: string
  notes: string
  recordStatus: string
  verificationNotes: string
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

function toForm(f: Prison): FormValues {
  const a = f.address ?? {}
  return {
    prisonName: f.prisonName,
    street: a.street ?? '',
    city: a.city ?? '',
    postalCode: a.postalCode ?? '',
    lines: (a.lines ?? []).join('\n'),
    country: f.country ?? '',
    routing: f.routing ?? '',
    scanService: f.scanService ?? '',
    pageLimit: f.pageLimit !== null ? String(f.pageLimit) : '',
    photoLimit: f.photoLimit !== null ? String(f.photoLimit) : '',
    mailLanguages: (f.mailLanguages ?? []).join(', '),
    notes: f.notes ?? '',
    recordStatus: f.recordStatus ?? 'published',
    verificationNotes: f.verificationNotes ?? '',
  }
}

/** The address as the form would save it: the record's other keys kept, blank fields dropped. */
function buildAddress(original: PrisonAddress, v: FormValues): PrisonAddress {
  const out: PrisonAddress = Object.fromEntries(Object.entries(original).filter(([key]) => !ADDRESS_KEYS.includes(key)))
  if (v.street.trim()) out.street = v.street.trim()
  if (v.city.trim()) out.city = v.city.trim()
  if (v.postalCode.trim()) out.postalCode = v.postalCode.trim()
  const lines = toLines(v.lines)
  if (lines.length) out.lines = lines
  return out
}

/** Problems the API would refuse, said before the request. */
function problems(v: FormValues, rules: Set<string>, list: MailRuleList | null): string[] {
  const out: string[] = []
  if (!v.prisonName.trim()) out.push('The facility needs a name.')
  if (toLines(v.lines).length > MAX_PRINT_LINES) out.push(`An envelope takes at most ${MAX_PRINT_LINES} print lines.`)
  for (const [key, label] of [['pageLimit', 'Page limit'], ['photoLimit', 'Photo limit']] as const) {
    const raw = v[key].trim()
    // isSafeInteger, not just digits: a long enough digit string is Infinity (sent as
    // null, i.e. "no limit") or loses precision on the way to JSON.
    if (raw && !(/^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) >= 1))
      out.push(`${label} must be a whole number of at least 1, or blank for no limit.`)
  }
  // The API refuses a photo limit on a facility that takes no photos at all.
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

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** The API body for what changed. Blank text and limits are null; rules go in master-list order. */
function changes(f: Prison, initial: FormValues, v: FormValues, rules: Set<string>, list: MailRuleList | null): FacilityFields {
  const out: FacilityFields = {}
  const text = (s: string) => s.trim() || null
  if (v.prisonName.trim() !== initial.prisonName.trim()) out.prisonName = v.prisonName.trim()
  for (const key of ['country', 'scanService', 'notes', 'verificationNotes'] as const)
    if (v[key].trim() !== initial[key].trim()) out[key] = text(v[key])
  if (v.routing !== initial.routing) out.routing = (v.routing || null) as RoutingMethod | null
  if (v.recordStatus !== initial.recordStatus) out.recordStatus = v.recordStatus as RecordStatus
  for (const key of ['pageLimit', 'photoLimit'] as const)
    if (v[key].trim() !== initial[key].trim()) out[key] = v[key].trim() ? Number(v[key]) : null
  const codes = toCodes(v.mailLanguages)
  if (!sameList(codes, toCodes(initial.mailLanguages))) out.mailLanguages = codes.length ? codes : null
  const address = buildAddress(f.address ?? {}, v)
  if (JSON.stringify(address) !== JSON.stringify(buildAddress(f.address ?? {}, initial))) out.address = address
  const order = list?.rules.map((r) => r.tag) ?? []
  const sorted = [...rules].sort((a, b) => (order.indexOf(a) + 1 || Infinity) - (order.indexOf(b) + 1 || Infinity))
  if (!sameList([...sorted].sort(), [...(f.mailRules ?? [])].sort())) out.mailRules = sorted
  return out
}

export default function EditFacility() {
  const id = Number(useParams().id)
  const facility = useApi(() => getFacility(id, true), [id], { keepPrevious: true })
  // Staff get retired rules too: a facility may still carry one.
  const rules = useApi(() => getMailRules(true), [])
  const [saved, setSaved] = useState(false)

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">
          <Link to="/admin/facilities">Facilities</Link> / {facility.data?.prisonName ?? 'Facility'}
        </span>
        {facility.data?.recordStatus === 'published' && (
          <span className="topbar-right">
            <Link to={`/facilities/${id}`}>View public page</Link>
          </span>
        )}
      </div>

      <div className="admin-content">
        {facility.loading && <p className="dash-note">Loading the record…</p>}
        {facility.error && (
          <div className="admin-alert admin-alert-err">
            {facility.error.status === 404 ? `There is no facility #${id}.` : `Couldn't load facility #${id} (${facility.error.message}).`}
            {facility.error.status !== 404 && (
              <button type="button" className="a-btn a-btn-sm" onClick={facility.reload}>
                Try again
              </button>
            )}
          </div>
        )}
        {saved && <div className="admin-alert admin-alert-ok">Saved.</div>}
        {facility.data && (
          <>
            <FacilityForm
              key={facility.data.updatedAt}
              facility={facility.data}
              rules={rules.data}
              rulesError={rules.error}
              onSaved={() => {
                setSaved(true)
                facility.reload()
              }}
              onEdit={() => setSaved(false)}
            />
            {/* Keyed on id only: linking a group mustn't reload the record and drop unsaved form edits. */}
            <RelayGroups key={facility.data.id} facility={facility.data} />
            <RecordHistory resource="prison" id={facility.data.id} version={facility.data.updatedAt} />
          </>
        )}
      </div>
    </>
  )
}

interface FormProps {
  facility: Prison
  rules: MailRuleList | null
  rulesError: ApiError | null
  onSaved: () => void
  onEdit: () => void
}

function FacilityForm({ facility: f, rules: list, rulesError, onSaved, onEdit }: FormProps) {
  const navigate = useNavigate()
  const initial = useMemo(() => toForm(f), [f])
  const [values, setValues] = useState(initial)
  const [ruleTags, setRuleTags] = useState(() => new Set(f.mailRules ?? []))
  const [markVerified, setMarkVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const diff = useMemo(() => changes(f, initial, values, ruleTags, list), [f, initial, values, ruleTags, list])
  const dirty = Object.keys(diff).length > 0 || markVerified
  const issues = problems(values, ruleTags, list)

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (key: keyof FormValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }))
    onEdit()
  }
  const field = (key: keyof FormValues) => ({
    id: `f-${key}`,
    value: values[key],
    disabled: busy,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  })
  const toggleRule = (tag: string) => {
    setRuleTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
    onEdit()
  }

  const languageHint = toCodes(values.mailLanguages)
    .filter((c) => /^[a-z]{2}$/.test(c))
    .map((c) => languageNames.of(c) ?? c)
    .join(', ')

  async function save() {
    onEdit()
    setBusy(true)
    setError(null)
    try {
      await updateFacility(f.id, {
        ...diff,
        // verifiedBy names a group (a Chapters id); a superadmin has none.
        ...(markVerified ? { verifiedAt: new Date().toISOString(), verifiedBy: null } : {}),
      })
      onSaved()
    } catch (err) {
      const e = err as ApiError
      setError(e.errors?.length ? e.errors.join(' ') : e.message)
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${f.prisonName} from the directory? This can't be undone.`)) return
    onEdit()
    setBusy(true)
    setError(null)
    try {
      await deleteFacility(f.id)
      navigate('/admin/facilities', { replace: true })
    } catch (err) {
      const e = err as ApiError
      setError(
        e.name === 'SequelizeForeignKeyConstraintError'
          ? 'Prisoners are listed at this facility, so it can’t be deleted. Move them first, or set it to draft to take it out of the directory.'
          : e.message,
      )
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
          {!list && !rulesError && <p className="form-hint">Loading the list of rules…</p>}
          {rulesError && <p className="form-hint">Couldn't load the list of rules ({rulesError.message}).</p>}
          {list && <RulePicker list={list} held={new Set(f.mailRules ?? [])} selected={ruleTags} disabled={busy} onToggle={toggleRule} />}
        </div>
      </Section>

      <Section title="Publishing and verification">
        <Field label="Record status" htmlFor="f-recordStatus" hint="Only published records appear in the public directory.">
          <select className="form-select" {...field('recordStatus')}>
            {RECORD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-group">
          <span className="form-label">Last verified</span>
          <p className={`form-static${isStale(f.verifiedAt) ? ' list-stale' : ''}`}>
            {f.verifiedAt ? shortDate(f.verifiedAt) : 'Never'}
            {isStale(f.verifiedAt) && ' — needs re-verifying'}
          </p>
          <label className="queue-check">
            <input type="checkbox" checked={markVerified} disabled={busy} onChange={(e) => setMarkVerified(e.target.checked)} />
            I have checked this record: mark it verified today
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
        <button type="button" className="a-btn a-btn-danger a-btn-sm" disabled={busy} onClick={() => void remove()}>
          Delete record
        </button>
        <div className="admin-form-footer-actions">
          <Link to="/admin/facilities" className="a-btn">
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

const categoryLabel = (c: MailRuleCategory) => (c.charAt(0).toUpperCase() + c.slice(1)).replace(/_/g, ' ')

/**
 * The master list by category. A retired rule appears only if the facility
 * already has it: it can be kept or removed, but the API refuses to add one.
 */
function RulePicker(props: { list: MailRuleList; held: Set<string>; selected: Set<string>; disabled: boolean; onToggle: (tag: string) => void }) {
  const { list, held, selected, disabled, onToggle } = props
  return (
    <div className="rule-picker">
      {list.categories.map((category) => {
        const inCategory = list.rules.filter((r) => r.category === category && (!r.retired || held.has(r.tag)))
        if (!inCategory.length) return null
        return (
          <fieldset key={category} className="rule-group">
            <legend className="form-hint">{categoryLabel(category)}</legend>
            {inCategory.map((rule) => (
              <label key={rule.tag} className="queue-check" title={rule.description ?? undefined}>
                <input type="checkbox" checked={selected.has(rule.tag)} disabled={disabled} onChange={() => onToggle(rule.tag)} />
                {rule.label}
                {rule.retired && <span className="list-sub"> (retired)</span>}
              </label>
            ))}
          </fieldset>
        )
      })}
    </div>
  )
}

/**
 * Linked relay groups, each unlinkable, and a picker to link another (searched
 * for by name, not picked from every group). Changes apply at once, and the
 * list updates from the API's answers rather than by reloading the record,
 * which would reset the form above.
 */
function RelayGroups({ facility: f }: { facility: Prison }) {
  const [linked, setLinked] = useState<Chapter[]>(() => f.relay_groups ?? [])
  const [choice, setChoice] = useState<Chapter | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** A group as the picker and the chosen line name it: any but an active one is marked. */
  const nameOf = (g: Chapter) => `${g.name}${g.accountStatus !== 'active' ? ` (${g.accountStatus})` : ''}`
  const active = linked.filter((g) => g.accountStatus === 'active')

  async function run(action: () => Promise<Chapter[]>) {
    setBusy(true)
    setError(null)
    try {
      setLinked(await action())
      setChoice(null)
    } catch (err) {
      setError((err as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-form relay-panel">
      <Section title="Relay groups">
        <p className="form-hint">
          Groups that print and mail letters for this facility. Linking and unlinking happen straight away, without Save. Only active groups can take
          letters.
        </p>
        {linked.length === 0 ? (
          <p className="form-static">None linked.</p>
        ) : (
          <ul className="relay-list">
            {linked.map((g: Chapter) => (
              <li key={g.id}>
                <Link to={`/groups/${g.id}`}>{g.name}</Link>
                {g.accountStatus !== 'active' && <span className="list-sub"> ({g.accountStatus})</span>}
                <button
                  type="button"
                  className="a-btn a-btn-danger a-btn-sm"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Unlink ${g.name} from ${f.prisonName}?`))
                      void run(async () => {
                        await unlinkRelayGroup(f.id, g.id)
                        return linked.filter((l) => l.id !== g.id)
                      })
                  }}
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        {f.routing === 'relay_only' && active.length === 0 && (
          <div className="admin-alert admin-alert-warn">This facility takes mail through a relay group only, and has no active one: nobody can write to it.</div>
        )}
        <div className="relay-add">
          <RecordPicker
            classes={{ input: 'form-input' }}
            label="Group to link"
            placeholder="Search groups by name…"
            disabled={busy}
            fetch={(q) => getGroups({ q, sort: 'name', page_size: PICKER_PAGE_SIZE })}
            exclude={linked.map((g) => g.id)}
            render={nameOf}
            onSelect={setChoice}
          />
          {choice && <span className="form-static">{nameOf(choice)}</span>}
          <button
            type="button"
            className="a-btn a-btn-sm"
            disabled={!choice || busy}
            onClick={() => {
              const added = choice
              if (added) void run(async () => (await linkRelayGroup(f.id, added.id)).updatedRows.relay_groups ?? linked)
            }}
          >
            Link group
          </button>
        </div>
        {error && <div className="admin-alert admin-alert-err">{error}</div>}
      </Section>
    </div>
  )
}
