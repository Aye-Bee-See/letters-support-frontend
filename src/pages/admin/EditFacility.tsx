import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteFacility, getFacility, getMailRules, linkRelayGroup, unlinkRelayGroup, updateFacility } from '../../api/facilities'
import { getGroups } from '../../api/groups'
import RecordHistory from '../../components/admin/RecordHistory'
import RulePicker from '../../components/admin/RulePicker'
import { Field, Section } from '../../components/forms/AdminFormParts'
import RecordPicker from '../../components/forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../../components/forms/recordPickerState'
import { useApi } from '../../hooks/useApi'
import type { ApiError, Chapter, MailRuleList, Prison, RecordStatus } from '../../types'
import { isStale, ROUTING_LABELS } from '../../utils/facilities'
import { changes, languageHint, MAX_PRINT_LINES, problems, RECORD_STATUSES, ROUTINGS, toForm, type FacilityFormValues } from '../../utils/facilityForm'
import { date } from '../../components/invitations/wording'
import { refusalText } from '../../utils/refusals'

// Edit one facility record (PUT /prison/prison, superadmins only). Only changed
// fields are sent, so the audit log says what was edited; `address` is one JSON
// value, so it goes whole. The form, its checks and the rule picker are shared
// with NewFacility.tsx (utils/facilityForm.ts, components/admin/RulePicker.tsx).
// Relay groups are links of their own (PUT and DELETE /prison/relay) and change
// at once, apart from Save. Unlike a prisoner's, a facility's edits don't touch
// queued letters.

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
          <div className="admin-alert admin-alert-err" role="alert">
            {facility.error.status === 404 ? `There is no facility #${id}.` : `Couldn't load facility #${id} (${refusalText(facility.error)}).`}
            {facility.error.status !== 404 && (
              <button type="button" className="a-btn a-btn-sm" onClick={facility.reload}>
                Try again
              </button>
            )}
          </div>
        )}
        {saved && <div className="admin-alert admin-alert-ok" role="status">Saved.</div>}
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

  const set = <K extends keyof FacilityFormValues>(key: K, value: FacilityFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    onEdit()
  }
  const field = (key: Exclude<keyof FacilityFormValues, 'recordStatus'>) => ({
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
      setError(e.errors?.length ? e.errors.join(' ') : refusalText(e))
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
          : refusalText(e),
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
          {!list && !rulesError && <p className="form-hint">Loading the list of rules…</p>}
          {rulesError && <p className="form-hint">Couldn't load the list of rules ({refusalText(rulesError)}).</p>}
          {list && <RulePicker list={list} held={new Set(f.mailRules ?? [])} selected={ruleTags} disabled={busy} onToggle={toggleRule} />}
        </div>
      </Section>

      <Section title="Publishing and verification">
        <Field label="Record status" htmlFor="f-recordStatus" hint="Only published records appear in the public directory.">
          <select id="f-recordStatus" className="form-select" value={values.recordStatus} disabled={busy} onChange={(e) => set('recordStatus', e.target.value as RecordStatus)}>
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
            {f.verifiedAt ? date(f.verifiedAt) : 'Never'}
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
        <div className="admin-alert admin-alert-warn form-error" role="status">
          {issues.map((text) => (
            <div key={text}>{text}</div>
          ))}
        </div>
      )}
      {error && <div className="admin-alert admin-alert-err form-error" role="alert">{error}</div>}

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
      setError(refusalText(err as ApiError))
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
          <div className="admin-alert admin-alert-warn" role="status">This facility takes mail through a relay group only, and has no active one: nobody can write to it.</div>
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
        {error && <div className="admin-alert admin-alert-err" role="alert">{error}</div>}
      </Section>
    </div>
  )
}
