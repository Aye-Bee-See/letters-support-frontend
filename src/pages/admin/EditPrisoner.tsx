import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getFacilities, getFacility } from '../../api/facilities'
import { deletePrisoner, getPrisoner, updatePrisoner, type PrisonerFields, type PrisonerMailChange } from '../../api/prisoners'
import RecordHistory from '../../components/admin/RecordHistory'
import { Field, Section } from '../../components/forms/AdminFormParts'
import PrisonerPhotoPanel from '../../components/forms/PrisonerPhotoPanel'
import RecordPicker from '../../components/forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../../components/forms/recordPickerState'
import { useApi } from '../../hooks/useApi'
import type { ApiError, Prison, Prisoner, RecordStatus } from '../../types'
import { isStale } from '../../utils/facilities'
import { displayName, STATUS_LABELS } from '../../utils/prisoners'
import { changes, facilityLabel, PRISONER_STATUSES, problems, RECORD_STATUSES, toForm, type PrisonerFormValues } from '../../utils/prisonerForm'
import { shortDate } from '../../utils/dates'
import { refusalText } from '../../utils/refusals'

// Edit one prisoner record (PUT /prisoner/prisoner, superadmins only). Only the
// fields that changed are sent, so the audit log says what was edited. A new
// facility, or a status of "free", moves the prisoner's mail: the API re-routes
// or holds queued letters and tells their writers, and says what it did. The
// form and its checks are shared with NewPrisoner.tsx (utils/prisonerForm.ts).

export default function EditPrisoner() {
  const id = Number(useParams().id)
  const prisoner = useApi(() => getPrisoner(id, false), [id], { keepPrevious: true })
  const [saved, setSaved] = useState<{ mail?: PrisonerMailChange } | null>(null)
  const [photoChanges, setPhotoChanges] = useState(0)

  const name = prisoner.data ? displayName(prisoner.data) : 'Prisoner'

  return (
    <>
      <div className="admin-topbar">
        <span className="topbar-title">
          <Link to="/admin/prisoners">Prisoners</Link> / {name}
        </span>
        {prisoner.data?.recordStatus === 'published' && (
          <span className="topbar-right">
            <Link to={`/prisoners/${id}`}>View public profile</Link>
          </span>
        )}
      </div>

      <div className="admin-content">
        {prisoner.loading && <p className="dash-note">Loading the record…</p>}
        {prisoner.error && (
          <div className="admin-alert admin-alert-err" role="alert">
            {prisoner.error.status === 404 ? `There is no prisoner #${id}.` : `Couldn't load prisoner #${id} (${refusalText(prisoner.error)}).`}
            {prisoner.error.status !== 404 && (
              <button type="button" className="a-btn a-btn-sm" onClick={prisoner.reload}>
                Try again
              </button>
            )}
          </div>
        )}
        {saved && <SavedNotice mail={saved.mail} />}
        {prisoner.data && (
          // Keyed on updatedAt: after a save the form starts again from the stored record.
          <PrisonerForm
            key={prisoner.data.updatedAt}
            prisoner={prisoner.data}
            onSaved={(result) => {
              setSaved(result)
              prisoner.reload()
            }}
            onEdit={() => setSaved(null)}
          />
        )}
        {/* Keyed on id only: a photo change mustn't reload the record and drop unsaved form edits. */}
        {prisoner.data && (
          <PrisonerPhotoPanel key={`photo-${prisoner.data.id}`} mode="admin" prisoner={prisoner.data} onChanged={() => setPhotoChanges((n) => n + 1)} />
        )}
        {/* A photo change is in the history too, without touching the record's updatedAt. */}
        {prisoner.data && <RecordHistory resource="prisoner" id={prisoner.data.id} version={`${prisoner.data.updatedAt}/${photoChanges}`} />}
      </div>
    </>
  )
}

function SavedNotice({ mail }: { mail?: PrisonerMailChange }) {
  const parts: string[] = []
  if (mail?.moved) parts.push('moved to the new facility')
  if (mail?.freed) parts.push('marked released')
  if (mail?.rerouted) parts.push(`${mail.rerouted} queued letter${mail.rerouted === 1 ? '' : 's'} re-routed`)
  if (mail?.held) parts.push(`${mail.held} letter${mail.held === 1 ? '' : 's'} held`)
  if (mail?.released) parts.push(`${mail.released} held letter${mail.released === 1 ? '' : 's'} let go`)
  return (
    <div className="admin-alert admin-alert-ok" role="status">
      Saved.{parts.length > 0 && ` Their mail: ${parts.join(', ')}. Their writers have been told.`}
    </div>
  )
}

interface FormProps {
  prisoner: Prisoner
  onSaved: (result: { mail?: PrisonerMailChange }) => void
  onEdit: () => void
}

function PrisonerForm({ prisoner, onSaved, onEdit }: FormProps) {
  const navigate = useNavigate()
  const initial = useMemo(() => toForm(prisoner), [prisoner])
  const [values, setValues] = useState(initial)
  const [markVerified, setMarkVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const diff = useMemo(() => changes(initial, values), [initial, values])
  const dirty = Object.keys(diff).length > 0 || markVerified
  const issues = problems(values)

  // Leaving the tab with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = <K extends keyof PrisonerFormValues>(key: K, value: PrisonerFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    onEdit()
  }
  const field = (key: Exclude<keyof PrisonerFormValues, 'featured' | 'recordStatus'>) => ({
    id: `f-${key}`,
    value: values[key],
    disabled: busy,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  })

  const warnings = mailWarnings(initial, diff)

  // The facility's name: the stored one fetched by id (without its prisoners),
  // another found with the picker. One that can't be fetched (deleted since) shows as its number.
  const storedFacility = useApi(() => (prisoner.prison !== null ? getFacility(prisoner.prison, false) : Promise.resolve(null)), [prisoner.prison])
  const [pickedFacility, setPickedFacility] = useState<Prison | null>(null)
  const currentFacility = [pickedFacility, storedFacility.data].find((f) => f && String(f.id) === values.prison)
  const facilityName = !values.prison ? 'Not listed' : currentFacility ? facilityLabel(currentFacility) : `Facility #${values.prison}`

  async function save() {
    onEdit()
    setBusy(true)
    setError(null)
    try {
      const body: PrisonerFields = {
        ...diff,
        // verifiedBy names a group (a Chapters id); a superadmin has none, so it is
        // cleared rather than left crediting whichever group checked it last.
        ...(markVerified ? { verifiedAt: new Date().toISOString(), verifiedBy: null } : {}),
      }
      const result = await updatePrisoner(prisoner.id, body)
      onSaved({ mail: result.mail })
    } catch (err) {
      const e = err as ApiError
      setError(e.errors?.length ? e.errors.join(' ') : refusalText(e))
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${displayName(prisoner)} from the directory? This can't be undone.`)) return
    onEdit()
    setBusy(true)
    setError(null)
    try {
      await deletePrisoner(prisoner.id)
      navigate('/admin/prisoners', { replace: true })
    } catch (err) {
      const e = err as ApiError
      // The API refuses with its database's foreign-key error (a 400) while threads point at the record.
      setError(
        e.name === 'SequelizeForeignKeyConstraintError'
          ? 'This prisoner has letter threads, so the record can’t be deleted. Set it to draft to take it out of the directory instead.'
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
          <Field
            label="Facility"
            htmlFor="f-prison"
            hint={storedFacility.loading && values.prison ? 'Loading the facility’s name…' : undefined}
          >
            <div className="relay-add picked-row">
              <span className="form-static">{facilityName}</span>
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
              placeholder="Search facilities to change it…"
              disabled={busy}
              fetch={(q) => getFacilities({ q, sort: 'name', page_size: PICKER_PAGE_SIZE })}
              exclude={values.prison ? [Number(values.prison)] : null}
              render={facilityLabel}
              onSelect={(f) => {
                setPickedFacility(f)
                set('prison', String(f.id))
              }}
            />
          </Field>
        </div>
        {warnings.map((text) => (
          <div key={text} className="admin-alert admin-alert-warn" role="status">
            {text}
          </div>
        ))}
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
            <span className="form-label">Front page</span>
            <label className="queue-check">
              <input type="checkbox" checked={values.featured} disabled={busy} onChange={(e) => set('featured', e.target.checked)} />
              Feature on the front page
            </label>
          </div>
        </div>
        <div className="form-group">
          <span className="form-label">Last verified</span>
          <p className={`form-static${isStale(prisoner.verifiedAt) ? ' list-stale' : ''}`}>
            {prisoner.verifiedAt ? shortDate(prisoner.verifiedAt) : 'Never'}
            {isStale(prisoner.verifiedAt) && ' — needs re-verifying'}
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
          <Link to="/admin/prisoners" className="a-btn">
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
 * What saving will do to the prisoner's mail, as the API decides it
 * (afterPrisonerChange): any change of facility is a move, including giving
 * one to someone who had none or taking it away; becoming "free" holds their
 * queued letters, and leaving "free" lets those go again.
 */
function mailWarnings(initial: PrisonerFormValues, diff: PrisonerFields): string[] {
  const out: string[] = []
  if ('prison' in diff) {
    out.push(
      diff.prison === null
        ? 'Saving removes their facility: their queued letters are held, and their writers are told.'
        : // A queued letter keeps its group if that group also mails to the new
          // facility. Otherwise the server re-routes it where it can (server mode)
          // or holds it until the writer sends it again (end-to-end mode, where it
          // can't re-seal a letter to another group).
          'Saving changes their facility: queued letters go ahead where their group also mails to the new facility; the rest are re-routed or held until the writer sends them again. Their writers are told.',
    )
  }
  if (diff.status === 'free') out.push('Saving marks them released: letters not yet mailed are held, and so are new ones written from now on; their writers are told.')
  else if (initial.status === 'free' && 'status' in diff)
    out.push('Saving undoes their release: letters held because they were released can go ahead again.')
  return out
}
