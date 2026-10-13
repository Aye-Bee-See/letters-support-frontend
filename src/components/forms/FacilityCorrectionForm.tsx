import { useState, type SubmitEvent } from 'react'
import { submitCorrection } from '../../api/corrections'
import { getMailRules } from '../../api/facilities'
import { toApiError } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import type { ApiError, Prison, PrisonAddress, RoutingMethod } from '../../types'
import { categoryLabel } from '../../utils/facilities'
import { refusalText } from '../../utils/refusals'

const ROUTING_OPTIONS: [RoutingMethod, string][] = [
  ['direct', 'Direct mail (physical letter)'],
  ['scan_only', 'Scan service only (e.g. JPay, Securus)'],
  ['direct_and_scan', 'Direct mail + scan service available'],
  ['relay_only', 'Relay only — direct mail not accepted'],
]

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))

/**
 * "Submit a correction" from solidarity-site/facility-profile.html, for group
 * admins (22 Sept: directory edits go through moderation). Name, routing and scan
 * service follow the prototype. Address and mail rules are structured inputs
 * instead of free text, so every change maps to a real field of the facility.
 * Markup reuses the prototype's corr-* classes, and org-settings' services-grid /
 * service-check for the rule checkboxes.
 */
export default function FacilityCorrectionForm({ prison }: { prison: Prison }) {
  const rules = useApi(getMailRules, [])
  const current = prison.address ?? {}

  const [open, setOpen] = useState(true)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [nothingChanged, setNothingChanged] = useState(false)

  const [name, setName] = useState('')
  const [street, setStreet] = useState(current.street ?? '')
  const [city, setCity] = useState(current.city ?? '')
  const [postalCode, setPostalCode] = useState(current.postalCode ?? '')
  const [linesText, setLinesText] = useState((current.lines ?? []).join('\n'))
  const [routing, setRouting] = useState<RoutingMethod | ''>('')
  const [scanService, setScanService] = useState('')
  const [ruleTags, setRuleTags] = useState(() => new Set(prison.mailRules ?? []))
  const [evidence, setEvidence] = useState('')

  const toggleRule = (tag: string) =>
    setRuleTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })

  /** Only what changed: blank or untouched inputs never overwrite the record. */
  function changedFields(): Record<string, unknown> {
    const fields: Record<string, unknown> = {}
    if (name.trim() && name.trim() !== prison.prisonName) fields.prisonName = name.trim()

    const address = { street: street.trim(), city: city.trim(), postalCode: postalCode.trim() }
    const lines = linesText.split('\n').map((l) => l.trim()).filter(Boolean)
    const linesChanged = lines.join('\n') !== (current.lines ?? []).join('\n')
    if (
      linesChanged ||
      address.street !== (current.street ?? '') ||
      address.city !== (current.city ?? '') ||
      address.postalCode !== (current.postalCode ?? '')
    ) {
      // The whole address object is replaced: keep any other parts the record has,
      // drop parts cleared here, and send print lines only when there are some.
      const merged: PrisonAddress = { ...current, ...address, lines: lines.length ? lines : undefined }
      fields.address = Object.fromEntries(
        Object.entries(merged).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v)),
      )
    }

    if (routing && routing !== prison.routing) fields.routing = routing
    if (scanService.trim() && scanService.trim() !== (prison.scanService ?? '')) fields.scanService = scanService.trim()

    if (!sameSet(ruleTags, new Set(prison.mailRules ?? []))) {
      const order = rules.data?.rules.map((r) => r.tag) ?? []
      fields.mailRules = [...ruleTags].sort((a, b) => {
        const ia = order.indexOf(a)
        const ib = order.indexOf(b)
        return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
      })
    }
    return fields
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    setError(null)
    const fields = changedFields()
    if (Object.keys(fields).length === 0) {
      setNothingChanged(true)
      return
    }
    setNothingChanged(false)
    setSending(true)
    try {
      await submitCorrection({ resource: 'prison', target: prison.id, fields, evidence: evidence.trim() || undefined })
      setSent(true)
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="correction-card">
        <div className="correction-card-header">
          <div className="correction-card-title">Sent for review</div>
          <div className="correction-card-note">
            Thank you. A network admin will review your correction before it appears on this page.
          </div>
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      <div style={{ marginTop: '2rem' }}>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          Submit a correction
        </button>
      </div>
    )
  }

  return (
    <form className="correction-card" onSubmit={onSubmit}>
      <div className="correction-card-header">
        <div className="correction-card-title">Submit a correction</div>
        <div className="correction-card-note">
          Change only what you have new information for — untouched fields will not overwrite existing data.{' '}
          <strong>All submissions go to a moderation queue and must be approved by a network admin before going live.</strong>
        </div>
      </div>

      <div className="correction-form">
        <div className="corr-field">
          <label className="corr-label" htmlFor="corrName">
            Facility name
            <span className="corr-label-opt">— if changed</span>
          </label>
          <input
            className="corr-input"
            type="text"
            id="corrName"
            placeholder={`Current name in the record: ${prison.prisonName}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Structured, replacing the prototype's free-text address box. */}
        <div className="corr-field">
          <label className="corr-label" htmlFor="corrStreet">
            Mailing address
            <span className="corr-label-opt">— edit if changed</span>
          </label>
          <input className="corr-input" type="text" id="corrStreet" placeholder="Street or P.O. box" value={street} onChange={(e) => setStreet(e.target.value)} />
        </div>
        <div className="corr-field">
          <label className="corr-label" htmlFor="corrCity">
            City, region
          </label>
          <input className="corr-input" type="text" id="corrCity" placeholder="e.g. Butner, NC" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="corr-field">
          <label className="corr-label" htmlFor="corrPostal">
            Postal code
          </label>
          <input className="corr-input" type="text" id="corrPostal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
        <div className="corr-field">
          <label className="corr-label" htmlFor="corrLines">
            As printed on envelopes
            <span className="corr-label-opt">— one line per row, in the order the facility says to write them</span>
          </label>
          <textarea
            className="corr-textarea"
            id="corrLines"
            rows={4}
            placeholder={'e.g.\n247755\nMozyr, Gomel region\nIK-20'}
            value={linesText}
            onChange={(e) => setLinesText(e.target.value)}
          />
          <p className="corr-hint">Up to 8 lines. When set, these are printed exactly as given instead of the fields above.</p>
        </div>

        <div className="corr-field">
          <label className="corr-label" htmlFor="corrRouting">
            Routing method
            <span className="corr-label-opt">— if changed</span>
          </label>
          <select
            className="corr-input"
            id="corrRouting"
            style={{ cursor: 'pointer' }}
            value={routing}
            onChange={(e) => setRouting(e.target.value as RoutingMethod | '')}
          >
            <option value="">— No change —</option>
            {ROUTING_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="corr-field">
          <label className="corr-label" htmlFor="corrScanService">
            Scan service name &amp; details
            <span className="corr-label-opt">— if applicable</span>
          </label>
          <textarea
            className="corr-textarea"
            id="corrScanService"
            rows={2}
            placeholder="e.g. JPay — $0.35/page, account required at jpay.com"
            value={scanService}
            onChange={(e) => setScanService(e.target.value)}
          />
        </div>

        {/* Structured, replacing the prototype's free-text rules box: the master list, current rules ticked. */}
        <div className="corr-field">
          <span className="corr-label">
            Mail rules
            <span className="corr-label-opt">— tick every rule the facility enforces</span>
          </span>
          {rules.loading && <p className="corr-hint">Loading the list of rules…</p>}
          {rules.error && <p className="corr-hint">Couldn't load the list of rules ({refusalText(rules.error)}).</p>}
          {rules.data?.categories.map((category) => {
            const inCategory = rules.data!.rules.filter((r) => r.category === category)
            if (!inCategory.length) return null
            return (
              <div key={category} style={{ marginTop: '0.6rem' }}>
                <p className="corr-hint">{categoryLabel(category)}</p>
                <div className="services-grid">
                  {inCategory.map((rule) => (
                    <label key={rule.tag} className="service-check" title={rule.description ?? undefined}>
                      <input type="checkbox" checked={ruleTags.has(rule.tag)} onChange={() => toggleRule(rule.tag)} />
                      {rule.label}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <hr className="corr-divider" />

        <div className="corr-evidence-field">
          <label className="corr-evidence-label" htmlFor="corrEvidence">
            Source &amp; explanation
          </label>
          <textarea
            className="corr-textarea"
            id="corrEvidence"
            rows={3}
            placeholder="Link to a policy document, family confirmation, firsthand experience, news article, etc. The more specific the better — admins use this to verify before approving."
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
          {/* 22 Sept: evidence is optional and encouraged (the prototype said required). */}
          <p className="corr-hint" style={{ marginTop: '0.4rem' }}>
            Optional, but encouraged. Submissions with a source are much easier to approve.
          </p>
        </div>

        <div className="corr-approval-warning">
          ⚠ Your submission will be reviewed by a network admin before any changes appear publicly. You will not see an
          immediate update to this page.
        </div>

        {nothingChanged && <p className="corr-hint">Nothing has been changed yet.</p>}
        {error && (
          <p className="corr-hint" style={{ color: 'var(--alert)' }}>
            {error.errors.length ? error.errors.join(' ') : refusalText(error)}
          </p>
        )}
      </div>

      <div className="correction-form-footer">
        <button type="button" className="corr-cancel" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="corr-submit-btn" disabled={sending}>
          {sending ? 'Sending…' : 'Submit for review'}
        </button>
      </div>
    </form>
  )
}
