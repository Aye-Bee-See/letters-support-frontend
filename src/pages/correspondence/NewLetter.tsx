import { useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getFacility } from '../../api/facilities'
import { getAllPrisoners } from '../../api/prisoners'
import { getAllWriters } from '../../api/writers'
import AddressSearch from '../../components/forms/AddressSearch'
import AttachmentRetry from '../../components/forms/AttachmentRetry'
import UploadZone from '../../components/forms/UploadZone'
import { isAnonymousWriter } from '../../groups/writers'
import { writerLabel } from '../../utils/groupLetters'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { useLetterDraft, type WriteAs } from '../../hooks/useLetterDraft'
import type { Prison, PrisonSummary } from '../../types'
import { addressLine, mailRuleLines } from '../../utils/facilities'
import { displayName, heldAt } from '../../utils/prisoners'

// Markup and classes from solidarity-site/new-letter.html (pages/new-letter.css).
// A group admin writes as one of the group's managed writers (`?writer=<id>`,
// from the inbox's Writers tab) or its anonymous writer (`?writer=anonymous`),
// chosen in the Writer tile when the link names none (README "Message fields",
// `user`; "Paper letters"). Sending: src/letters/send.ts.

/** The Writer tile's option for the group's anonymous writer (writer ids start at 1). */
const ANONYMOUS_OPTION = 0

export default function NewLetter() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const prisonerId = Number(params.get('prisoner')) || null
  const { user } = useAuth()
  const isGroup = user?.role === 'chapter'

  // A group admin: the group's writers, and the one this letter is written as.
  const writers = useApi(() => (isGroup ? getAllWriters() : Promise.resolve(null)), [isGroup])
  const managed = useMemo(() => (writers.data ?? []).filter((w) => !isAnonymousWriter(w)), [writers.data])
  const writerParam = params.get('writer')
  const chosenWriter = writerParam && writerParam !== 'anonymous' ? (managed.find((w) => String(w.id) === writerParam) ?? null) : null
  const writeAs: WriteAs | null = !isGroup
    ? null
    : writerParam === 'anonymous'
      ? { kind: 'anonymous' }
      : chosenWriter
        ? { kind: 'writer', id: chosenWriter.id, publicKey: chosenWriter.publicKey }
        : null
  /** A `?writer=` that names nobody the group still manages (claimed, deleted, or a typo). */
  const unknownWriter = isGroup && Boolean(writerParam) && writerParam !== 'anonymous' && writers.data !== null && !chosenWriter
  const writerName = writeAs?.kind === 'anonymous' ? 'the anonymous writer' : chosenWriter ? writerLabel(chosenWriter) : null

  const directory = useApi(() => getAllPrisoners({ sort: 'name' }), [])
  const prisoner = useMemo(() => directory.data?.find((p) => p.id === prisonerId) ?? null, [directory.data, prisonerId])
  const facilityState = useApi(
    () => (prisoner?.prison ? getFacility(prisoner.prison, true) : Promise.resolve(null)),
    [prisoner?.prison ?? null],
  )
  const facility: Prison | null = facilityState.data ?? null
  /** A `?prisoner=` that names nobody in the directory (unpublished, removed, or a typo). */
  const unknownPrisoner = prisonerId !== null && directory.data !== null && !prisoner
  /** In the directory, but held at no facility on record: there is nowhere to mail a letter. */
  const noFacility = prisoner !== null && !prisoner.prison

  const draft = useLetterDraft(prisoner?.id ?? null, facility, undefined, undefined, writeAs)
  const [notesOpen, setNotesOpen] = useState(false)
  const rules = facility ? mailRuleLines(facility) : []
  const group = draft.groups.find((g) => g.id === draft.relayChapterId) ?? null
  useLeaveGuard(draft.hasContent, 'Leave without sending your letter?')
  // No group can take this letter: none mails to the facility, or every one has blocked this writer.
  const noGroup = Boolean(facility) && (draft.groups.length === 0 || draft.allBlocked)

  /** Change one search parameter, keeping the other (the prisoner and the writer travel together). */
  const setParam = (name: 'prisoner' | 'writer', value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace: true })
  }
  const choosePrisoner = (id: number | null) => setParam('prisoner', id ? String(id) : null)
  const chooseWriter = (id: number | null) => setParam('writer', id === null ? null : id === ANONYMOUS_OPTION ? 'anonymous' : String(id))

  /** Who can read the letter, in words, for the note under Send. */
  const readerGroups = group && group.id !== user?.chapterId ? ['your group', group.name] : ['your group']
  const andList = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0])
  const readers = !isGroup
    ? `Only you and ${group ? group.name : 'that group'} can read it.`
    : writeAs?.kind === 'anonymous'
      ? `Only ${andList(readerGroups)} can read it.`
      : chosenWriter && !chosenWriter.publicKey
        ? `Only ${andList(readerGroups)} can read it until ${writerName} has keys; they get their copy then.`
        : `Only ${andList([writerName ?? 'the writer', ...readerGroups])} can read it.`

  async function onSend() {
    const message = await draft.send()
    if (message) navigate(`/threads/${message.chat}`)
  }

  // The group tiles are one radio group: Tab reaches the chosen tile, the arrows move the choice, Space or Enter picks.
  const choosable = draft.groups.filter((g) => !draft.blocked.has(g.id))
  const focusTileId = choosable.some((g) => g.id === draft.relayChapterId) ? draft.relayChapterId : (choosable[0]?.id ?? null)
  function onTileKey(e: KeyboardEvent<HTMLDivElement>, groupId: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      draft.setChosenGroup(groupId)
      return
    }
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0 || choosable.length === 0) return
    e.preventDefault()
    const at = choosable.findIndex((g) => g.id === groupId)
    const next = choosable[(at + step + choosable.length) % choosable.length]
    draft.setChosenGroup(next.id)
    e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-group="${next.id}"]`)?.focus()
  }

  return (
    <div className="letter-wrap">
      <title>New letter · letters.support</title>
      <div className="letter-layout">
        {/* LEFT: composition area */}
        <main className="letter-main">
          <h1 className="letter-page-title">New letter to prisoner</h1>

          <div className="facility-guidance" style={{ alignItems: 'stretch' }}>
            {prisoner && facilityState.error ? (
              <div className="facility-guidance-empty" role="alert">
                Couldn’t load {displayName(prisoner)}’s facility and its mail rules ({facilityState.error.message}).{' '}
                <button type="button" className="addr-remove-btn" onClick={facilityState.reload}>
                  Try again
                </button>
              </div>
            ) : noFacility ? (
              <div className="facility-guidance-empty">
                {displayName(prisoner)} isn’t listed at any facility at the moment, so there is nowhere to mail a letter to them.
              </div>
            ) : prisoner && facility ? (
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
              {isGroup
                ? `Nothing to type: a letter written by hand, that ${group?.name ?? 'the group'} mails. It is logged here so a reply can find its way back to ${writeAs?.kind === 'anonymous' ? 'your group' : (writerName ?? 'its writer')}.`
                : `Nothing to type: you are handing this letter to ${group?.name ?? 'the group'} on paper. It is logged here so a reply can find its way back to you.`}
            </p>
          ) : (
            <>
              <textarea
                className="letter-textarea"
                aria-label="Your letter"
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
              {isGroup ? 'This letter is written by hand, on paper' : "I'm handing this letter to the group on paper"}
            </label>
          </div>

          {!noGroup && (
            <button type="button" className="notes-toggle" onClick={() => setNotesOpen((o) => !o)}>
              {notesOpen ? '− Hide the note' : `+ Add a note to ${group?.name ?? 'the group'}`}
            </button>
          )}
          <div className={notesOpen && !noGroup ? 'notes-area is-open' : 'notes-area'}>
            <textarea
              className="notes-textarea"
              aria-label={`Note to ${group?.name ?? 'the group'}, not sent to the prisoner`}
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
              {draft.attachmentFailed && (
                <AttachmentRetry
                  fileName={draft.attachmentFailed.fileName}
                  error={draft.attachmentFailed.error}
                  busy={draft.sending}
                  onRetry={async () => {
                    const message = await draft.retryAttachment()
                    if (message) navigate(`/threads/${message.chat}`)
                  }}
                  onSkip={() => {
                    const message = draft.skipAttachment()
                    if (message) navigate(`/threads/${message.chat}`)
                  }}
                />
              )}
              {draft.error && (
                <p style={{ color: 'var(--alert)' }}>
                  <strong>Not sent.</strong> {draft.error}
                </p>
              )}
              {noFacility ? (
                // Nowhere to mail it: say why Send stays off.
                <p>
                  <strong>This letter can't be sent through this site right now.</strong> {displayName(prisoner)} isn’t listed at
                  any facility, so no group can mail it. <Link to={`/prisoners/${prisoner.id}`}>Their profile</Link> says more.
                </p>
              ) : prisoner && facilityState.error ? (
                <p>
                  <strong>This letter can’t be sent until the facility loads:</strong> its mail rules and the groups that mail
                  there are needed first. Try again above.
                </p>
              ) : noGroup ? (
                // Nothing to send to: say why, rather than describe a queue there isn't.
                <p>
                  <strong>This letter can't be sent through this site right now.</strong>{' '}
                  {draft.allBlocked
                    ? 'No group that mails to this facility is taking your letters.'
                    : 'No group mails to this facility yet.'}
                </p>
              ) : (
                <>
                  {isGroup ? (
                    <>
                      {!writeAs && (
                        <p>
                          <strong>Choose who this letter is from</strong> in the Writer box: one of your group's writers, or
                          anonymously.
                        </p>
                      )}
                      {!draft.hasGroupKey && (
                        <p>
                          <strong>You can't write for your group's writers yet:</strong> you don't hold the group key.
                        </p>
                      )}
                      <p>
                        It goes to {group ? group.name : 'the group'}'s queue{draft.paper ? ', to be mailed' : ' to be printed and mailed'}
                        {writerName ? `, from ${writerName}` : ''}.
                      </p>
                    </>
                  ) : (
                    <p>
                      <strong>Your letter won't be sent immediately.</strong> It goes to {group ? group.name : 'the group'}'s
                      queue; they print it and mail it for you.
                    </p>
                  )}
                  <p>{readers}</p>
                </>
              )}
            </div>
          </div>
        </main>

        {/* RIGHT SIDEBAR: address tiles */}
        <aside className="letter-sidebar">
          {isGroup && (
            <div className="addr-tile">
              <div className="addr-tile-header">Writer</div>
              <div className="addr-tile-body">
                {writers.error && (
                  <p className="relay-select-hint">
                    Couldn't load your group's writers ({writers.error.message}).{' '}
                    <button type="button" className="addr-remove-btn" onClick={writers.reload}>
                      Try again
                    </button>
                  </p>
                )}
                {!writeAs && !writers.error && (
                  <>
                    <AddressSearch
                      placeholder={writers.loading ? 'Loading your writers…' : 'Search your writers…'}
                      label="Who the letter is from"
                      loading={writers.loading}
                      options={[
                        { id: ANONYMOUS_OPTION, label: 'Anonymously', sub: "Your group's anonymous writer" },
                        ...managed.map((w) => ({ id: w.id, label: writerLabel(w), sub: w.penName && w.name ? w.name : undefined })),
                      ]}
                      onSelect={chooseWriter}
                    />
                    <p className="relay-select-hint">
                      {unknownWriter
                        ? 'The writer in this link is no longer one of your group’s: they may have claimed their account, or been deleted. Choose another.'
                        : 'Who the letter is from. A reply comes back to this writer.'}{' '}
                      <Link to="/writers/new">Add a writer</Link>
                    </p>
                  </>
                )}
                {writeAs && (
                  <div className="addr-selected is-visible">
                    <div className="addr-selected-header">
                      <span className="addr-selected-name">{writeAs.kind === 'anonymous' ? 'Anonymously' : writerName}</span>
                      <button type="button" className="addr-remove-btn" title="Choose another writer" onClick={() => chooseWriter(null)}>
                        ✕
                      </button>
                    </div>
                    <p className="relay-select-hint">
                      {writeAs.kind === 'anonymous'
                        ? 'Under your group’s anonymous writer, shared by everyone it writes for. Replies stay with the group.'
                        : chosenWriter && !chosenWriter.publicKey
                          ? `${writerName} has no keys yet, so the letter is sealed to your group alone; they get their copy once they have keys.`
                          : chosenWriter?.penName
                            ? `Signed ${chosenWriter.penName}${chosenWriter.name ? ` (${chosenWriter.name})` : ''}; replies come back to this name.`
                            : 'No pen name yet: the letter is signed with their name.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="addr-tile">
            <div className="addr-tile-header">Prisoner</div>
            <div className="addr-tile-body">
              {directory.error && (
                <p className="relay-select-hint" role="alert">
                  Couldn't load the directory ({directory.error.message}).{' '}
                  <button type="button" className="addr-remove-btn" onClick={directory.reload}>
                    Try again
                  </button>
                </p>
              )}
              {unknownPrisoner && (
                <p className="relay-select-hint">
                  The person in this link isn’t in the directory: they may have been taken out of it, or the link is wrong. Search
                  for them below.
                </p>
              )}
              {!prisoner && !directory.error && (
                <AddressSearch
                  placeholder={directory.loading ? 'Loading the directory…' : 'Search by name…'}
                  label="Prisoner to write to"
                  loading={directory.loading}
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
                    <div className="relay-tiles" role="radiogroup" aria-label="Group that prints and mails this letter">
                      {draft.groups.map((g) => {
                        // A group that has blocked this writer (API #179) can't be chosen; say so, with their reason.
                        const block = draft.blocked.get(g.id)
                        return (
                          <div
                            key={g.id}
                            data-group={g.id}
                            className={block ? 'relay-option is-blocked' : g.id === draft.relayChapterId ? 'relay-option selected' : 'relay-option'}
                            role="radio"
                            aria-checked={g.id === draft.relayChapterId}
                            aria-disabled={Boolean(block)}
                            tabIndex={!block && g.id === focusTileId ? 0 : -1}
                            onClick={() => !block && draft.setChosenGroup(g.id)}
                            onKeyDown={(e) => !block && onTileKey(e, g.id)}
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
