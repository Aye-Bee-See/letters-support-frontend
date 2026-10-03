import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getFacility } from '../../api/facilities'
import { getAllPrisoners } from '../../api/prisoners'
import AddressSearch from '../../components/forms/AddressSearch'
import UploadZone from '../../components/forms/UploadZone'
import { useApi } from '../../hooks/useApi'
import { useLetterDraft } from '../../hooks/useLetterDraft'
import type { Prison, PrisonSummary } from '../../types'
import { addressLine, mailRuleLines } from '../../utils/facilities'
import { displayName, heldAt } from '../../utils/prisoners'

// Markup and classes from solidarity-site/new-letter.html (pages/new-letter.css),
// writer version. The group version (the Writer tile: send as a managed or the
// anonymous writer) comes with the group inbox. Sending: src/letters/send.ts.

export default function NewLetter() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const prisonerId = Number(params.get('prisoner')) || null

  const directory = useApi(() => getAllPrisoners({ sort: 'name' }), [])
  const prisoner = useMemo(() => directory.data?.find((p) => p.id === prisonerId) ?? null, [directory.data, prisonerId])
  const facilityState = useApi(
    () => (prisoner?.prison ? getFacility(prisoner.prison, true) : Promise.resolve(null)),
    [prisoner?.prison ?? null],
  )
  const facility: Prison | null = facilityState.data ?? null

  const draft = useLetterDraft(prisoner?.id ?? null, facility)
  const [notesOpen, setNotesOpen] = useState(false)
  const rules = facility ? mailRuleLines(facility) : []
  const group = draft.groups.find((g) => g.id === draft.relayChapterId) ?? null

  const choosePrisoner = (id: number | null) => setParams(id ? { prisoner: String(id) } : {}, { replace: true })

  async function onSend() {
    const message = await draft.send()
    if (message) navigate(`/threads/${message.chat}`)
  }

  return (
    <div className="letter-wrap">
      <div className="letter-layout">
        {/* LEFT: composition area */}
        <main className="letter-main">
          <h1 className="letter-page-title">New letter to prisoner</h1>

          <div className="facility-guidance" style={{ alignItems: 'stretch' }}>
            {prisoner && facility ? (
              <div className="facility-rules">
                <span className="facility-rules-heading">Facility rules — {facility.prisonName}</span>
                {rules.length > 0 ? (
                  <ul className="facility-rules-list">
                    {rules.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="facility-guidance-empty">No mail rules are on record. Check with the group before writing.</p>
                )}
              </div>
            ) : (
              <div className="facility-guidance-empty">Select a prisoner to see facility mail rules.</div>
            )}
            <UploadZone
              variant="compact"
              file={draft.file}
              onFile={draft.setFile}
              label={draft.paper ? 'Add a photo (optional)' : 'Upload scan instead'}
            />
          </div>

          {draft.paper ? (
            <p className="letter-meta-bar" style={{ padding: '1rem 0' }}>
              Nothing to type: you are handing this letter to {group?.name ?? 'the group'} on paper. It is logged here so a
              reply can find its way back to you.
            </p>
          ) : (
            <>
              <textarea
                className="letter-textarea"
                placeholder={'Write your letter here.\n\nParagraph breaks will be preserved when printed. Facility page limits are shown above.'}
                value={draft.text}
                onChange={(e) => draft.setText(e.target.value)}
              />
              <div className="letter-meta-bar">
                <span>{draft.text.length.toLocaleString()} characters</span>
                <span style={draft.overPageLimit ? { color: 'var(--alert)' } : undefined}>
                  ~{draft.pages} {draft.pages === 1 ? 'page' : 'pages'}
                  {facility?.pageLimit ? ` (limit ${facility.pageLimit})` : ''}
                </span>
              </div>
            </>
          )}

          {/* 22 Sept: "on paper" — a handwritten letter handed to the group; starts as printed. */}
          <div className="claim-check-row" style={{ marginTop: '0.75rem' }}>
            <input type="checkbox" id="onPaper" checked={draft.paper} onChange={(e) => draft.setPaper(e.target.checked)} />
            <label className="claim-check-label" htmlFor="onPaper">
              I'm handing this letter to the group on paper
            </label>
          </div>

          <button type="button" className="notes-toggle" onClick={() => setNotesOpen((o) => !o)}>
            {notesOpen ? '− Hide the note' : `+ Add a note to ${group?.name ?? 'the group'}`}
          </button>
          <div className={notesOpen ? 'notes-area is-open' : 'notes-area'}>
            <textarea
              className="notes-textarea"
              placeholder='Optional. E.g. "poor scan quality" or "written at the Aug 3 letter night."'
              value={draft.relayNote}
              onChange={(e) => draft.setRelayNote(e.target.value)}
            />
            <p className="notes-hint">Only the group that mails your letter sees this. It is not sent to the prisoner.</p>
          </div>

          <div className="submit-row">
            <button type="button" className="submit-btn" disabled={!draft.canSend} onClick={onSend}>
              {draft.sending ? 'Sending…' : 'Send letter'}
            </button>
            <div className="submit-notes">
              {draft.error && (
                <p style={{ color: 'var(--alert)' }}>
                  <strong>Not sent.</strong> {draft.error}
                </p>
              )}
              <p>
                <strong>Your letter won't be sent immediately.</strong> It goes to {group ? group.name : 'the group'}'s
                queue; they print it and mail it for you.
              </p>
              <p>Only you and {group ? group.name : 'that group'} can read it.</p>
            </div>
          </div>
        </main>

        {/* RIGHT SIDEBAR: address tiles */}
        <aside className="letter-sidebar">
          <div className="addr-tile">
            <div className="addr-tile-header">Prisoner</div>
            <div className="addr-tile-body">
              {!prisoner && (
                <AddressSearch
                  placeholder={directory.loading ? 'Loading the directory…' : 'Search by name…'}
                  options={(directory.data ?? []).map((p) => ({
                    id: p.id,
                    label: displayName(p),
                    sub: heldAt(p.prison_details as PrisonSummary | null | undefined) ?? undefined,
                  }))}
                  onSelect={choosePrisoner}
                />
              )}
              {prisoner && (
                <div className="addr-selected is-visible">
                  <div className="addr-selected-header">
                    <span className="addr-selected-name">{displayName(prisoner)}</span>
                    <button type="button" className="addr-remove-btn" title="Choose someone else" onClick={() => choosePrisoner(null)}>
                      ✕
                    </button>
                  </div>
                  <dl className="addr-info">
                    <dt>Country / facility</dt>
                    <dd>{heldAt(prisoner.prison_details as PrisonSummary | null | undefined) ?? 'Not listed'}</dd>
                    {facility && (
                      <>
                        <dt>Mailing address</dt>
                        <dd style={{ fontFamily: 'var(--mono)', fontSize: '0.67rem', lineHeight: 1.5 }}>{addressLine(facility.address)}</dd>
                      </>
                    )}
                    <dt>Mailed by</dt>
                    <dd>{facility ? draft.groups.map((g) => g.name).join(', ') || 'No group yet' : '…'}</dd>
                    {prisoner.interests && prisoner.interests.length > 0 && (
                      <>
                        <dt>Interests</dt>
                        <dd>
                          <div className="addr-tags">
                            {prisoner.interests.map((t) => (
                              <span key={t} className="tag">
                                {t}
                              </span>
                            ))}
                          </div>
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
              )}
            </div>
          </div>

          {prisoner && facility && (
            <div className="addr-tile">
              <div className="addr-tile-header">Mailing group</div>
              <div className="addr-tile-body">
                {draft.groups.length === 0 ? (
                  <p className="relay-select-hint">
                    No group mails to {facility.prisonName} yet, so letters to {displayName(prisoner)} can't be sent through
                    this site. <Link to="/groups">Find a group</Link> to ask.
                  </p>
                ) : (
                  <>
                    <div className="relay-tiles">
                      {draft.groups.map((g) => {
                        // A group that has blocked this writer (API #179) can't be chosen; say so, with their reason.
                        const block = draft.blocked.get(g.id)
                        return (
                          <div
                            key={g.id}
                            className={block ? 'relay-option is-blocked' : g.id === draft.relayChapterId ? 'relay-option selected' : 'relay-option'}
                            role="radio"
                            aria-checked={g.id === draft.relayChapterId}
                            aria-disabled={Boolean(block)}
                            tabIndex={block ? -1 : 0}
                            onClick={() => !block && draft.setChosenGroup(g.id)}
                            onKeyDown={(e) => !block && e.key === 'Enter' && draft.setChosenGroup(g.id)}
                          >
                            <div>
                              <div className="relay-option-name">{g.name}</div>
                              <div className="relay-option-location">
                                {block ? `Not mailing your letters: “${block.reason}”` : [g.subregion, g.country].filter(Boolean).join(', ')}
                              </div>
                            </div>
                            <span className="relay-checkmark">{g.id === draft.relayChapterId ? '✓' : ''}</span>
                          </div>
                        )
                      })}
                    </div>
                    {draft.allBlocked ? (
                      <p className="relay-select-hint">
                        No group that mails to {facility.prisonName} is taking your letters right now, so this one can’t be sent through this site.
                      </p>
                    ) : (
                      draft.groups.length > 1 && (
                        <p className="relay-select-hint">These groups all mail to this facility. Choose who prints and mails your letter.</p>
                      )
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
