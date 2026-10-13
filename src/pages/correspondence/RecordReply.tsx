import { useState, type SubmitEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getAllChats, lookupReference, searchWriters } from '../../api/letters'
import RecordReplyPanel, { type RecordedReply } from '../../components/forms/RecordReplyPanel'
import { useApi } from '../../hooks/useApi'
import type { Chat, LetterStatus, ReferenceLookup, WriterMatch } from '../../types'
import { writerInSentence, writerLabel } from '../../utils/groupLetters'
import { refusalText } from '../../utils/refusals'
import { threadPrisonerName } from '../../utils/letters'
import { displayName } from '../../utils/prisoners'
import { checkReference, describeReferenceError, formatReference, normalizeReference, REFERENCE_EXAMPLE } from '../../utils/replyReference'

// /replies/new: a group admin records a prisoner's reply that came to the
// group's PO box (README "Reply reference": filing a reply). Step 1 finds
// whose it is: by the reply reference the prisoner copied from the letter's
// footer (GET /messaging/reference), or, with no number, by the writer's pen
// name (GET /messaging/writers, current or former) and then the prisoner from
// that writer's threads. Step 2 is the reply itself (RecordReplyPanel). The
// print page links here as /replies/new?reply=<reference>, which looks it up
// straight away. Markup from the thread page's reply panel (pages/thread.css).

const STATUS_WORDS: Record<LetterStatus, string> = {
  queued: 'waiting to print',
  printed: 'printed',
  mailed: 'mailed',
  received: 'a reply',
  returned: 'returned',
  declined: 'not sent',
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

/** The reply panel's writer, from the lookup's or the search's: named for a sentence. */
const panelWriter = (w: { id: number; penName: string | null; name: string | null; anonymous: boolean }) => ({
  id: w.id,
  name: writerInSentence(w, `writer ${w.id}`),
  anonymous: w.anonymous,
})

/** Who the reply goes to, settled by step 1. */
interface Target {
  /** `publicKey` from the reference lookup; the name search gives none, so the panel fetches it. */
  writer: { id: number; name: string; publicKey?: string | null; anonymous?: boolean }
  prisoner: { id: number; name: string }
  reference: string | null
}

/** What a reply reference points at: the writer, the prisoner, the group, and the letter it answers. */
function FoundLetter({ found }: { found: ReferenceLookup }) {
  const letter = found.letter
  return (
    <div className="reply-found">
      <div>
        <div className="thread-sidebar-heading">Writer</div>
        <div className="thread-sidebar-info">
          <strong>{found.writer ? writerLabel(found.writer, `Writer ${found.writer.id}`) : 'No longer on the site'}</strong>
        </div>
      </div>
      <div>
        <div className="thread-sidebar-heading">Prisoner</div>
        <div className="thread-sidebar-info">
          <strong>{found.prisoner ? displayName(found.prisoner) : 'Not in the directory'}</strong>
        </div>
      </div>
      <div>
        <div className="thread-sidebar-heading">Care of</div>
        <div className="thread-sidebar-info">
          <strong>{found.careOf?.name ?? '—'}</strong>
        </div>
      </div>
      <div>
        <div className="thread-sidebar-heading">Answers the letter</div>
        <div className="thread-sidebar-info">
          {letter ? (
            <>
              of <strong>{longDate(letter.createdAt)}</strong>
              {letter.paper ? ', written on paper' : ''}:{' '}
              {found.mailedAt ? `mailed ${longDate(found.mailedAt)}` : STATUS_WORDS[letter.status]}
              {found.mailedAt && letter.status !== 'mailed' ? `, ${STATUS_WORDS[letter.status]} since` : ''}
            </>
          ) : (
            <>No longer kept{found.mailedAt ? `; it was mailed ${longDate(found.mailedAt)}` : ''}. The reply still goes in the thread.</>
          )}
          {found.chat && (
            <>
              {' '}
              · <Link to={`/threads/${found.chat}`}>Open the conversation</Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Step 1, by reply reference. */
function ByReference({ initial, onTarget }: { initial: string; onTarget: (target: Target | null) => void }) {
  const [typed, setTyped] = useState(() => formatReference(initial))
  // A number that passes the check digit here; the API checks it again.
  const [submitted, setSubmitted] = useState(() => (checkReference(initial) === 'ok' ? normalizeReference(initial) : ''))
  const [problem, setProblem] = useState<string | null>(() =>
    initial && checkReference(initial) === 'checksum' ? 'That number has a mistake in it; check it against the letter.' : null,
  )
  const lookup = useApi(() => (submitted ? lookupReference(submitted) : Promise.resolve(null)), [submitted])

  function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    onTarget(null)
    const state = checkReference(typed)
    if (state === 'incomplete') {
      setProblem(`A reply reference is nine digits, like ${REFERENCE_EXAMPLE}. Dashes and spaces are optional.`)
      setSubmitted('')
    } else if (state === 'checksum') {
      setProblem('That number has a mistake in it; check it against the letter.')
      setSubmitted('')
    } else {
      setProblem(null)
      setTyped(formatReference(typed))
      if (normalizeReference(typed) === submitted) lookup.reload()
      setSubmitted(normalizeReference(typed))
    }
  }

  const found = submitted && !problem ? lookup.data : null
  const failed = submitted && !problem ? lookup.error : null
  // What step 2 needs, once the volunteer confirms it is the right letter.
  const ready: Target | null =
    found && found.writer && found.prisoner
      ? {
          // The lookup gives the writer's key (README "Reply reference"), so nothing more is fetched;
          // an older API without the field leaves it undefined, and the panel fetches it.
          writer: { ...panelWriter(found.writer), publicKey: found.writer.publicKey },
          prisoner: { id: found.prisoner.id, name: displayName(found.prisoner) },
          reference: found.reference,
        }
      : null

  return (
    <form className="reply-panel-body" onSubmit={onSubmit}>
      <label className="thread-sidebar-heading" htmlFor="replyReference">
        Reply reference
      </label>
      <div className="reply-reference-row">
        <input
          id="replyReference"
          className="reply-reference-input"
          inputMode="numeric"
          autoComplete="off"
          placeholder={REFERENCE_EXAMPLE}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={Boolean(submitted) && !problem && lookup.loading}>
          {submitted && !problem && lookup.loading ? 'Looking up…' : 'Look up'}
        </button>
      </div>
      <p className="reply-notes-hint">The nine digits the prisoner copied from the bottom of the letter, usually at the top of their reply.</p>
      {problem && (
        <p className="reply-notes-hint" style={{ color: 'var(--alert)' }}>
          {problem}
        </p>
      )}
      {failed && (
        <p className="reply-notes-hint" style={{ color: 'var(--alert)' }}>
          {describeReferenceError(failed) ?? `Couldn't look that number up (${refusalText(failed)}).`}
        </p>
      )}
      {found && <FoundLetter found={found} />}
      {found && !ready && <p className="reply-notes-hint">The writer or the prisoner of this letter is gone, so a reply can't be filed under it.</p>}
      {ready && (
        <p style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onTarget(ready)}>
            Record the reply to this letter
          </button>
        </p>
      )}
    </form>
  )
}

/** Step 1, by name: the writer by current or former pen name, then the prisoner from their threads. */
function ByName({ onTarget }: { onTarget: (target: Target | null) => void }) {
  const [typed, setTyped] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [writer, setWriter] = useState<WriterMatch | null>(null)
  const matches = useApi(() => (submitted ? searchWriters(submitted) : Promise.resolve(null)), [submitted])
  // The chosen writer's threads this group can see: its managed writers' and the ones it mails.
  // Every page of them: a long-standing writer may have more than a page.
  const threads = useApi(() => (writer ? getAllChats({ user: writer.id }) : Promise.resolve(null)), [writer?.id])

  function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    onTarget(null)
    setWriter(null)
    const name = typed.trim()
    if (name === submitted) matches.reload()
    setSubmitted(name.length >= 2 ? name : '')
  }

  function choose(chat: Chat) {
    if (!writer) return
    onTarget({
      writer: panelWriter(writer),
      prisoner: { id: chat.prisoner, name: threadPrisonerName(chat) },
      reference: null,
    })
  }

  return (
    <form className="reply-panel-body" onSubmit={onSubmit}>
      <label className="thread-sidebar-heading" htmlFor="writerName">
        Writer's pen name
      </label>
      <div className="reply-reference-row">
        <input
          id="writerName"
          className="reply-reference-input"
          autoComplete="off"
          placeholder="The name the reply is addressed to"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={typed.trim().length < 2}>
          Search
        </button>
      </div>
      <p className="reply-notes-hint">At least two letters. Searches the writers whose letters your group mailed, by their pen name now or one they used before.</p>

      {submitted && matches.loading && <p className="reply-notes-hint">Searching…</p>}
      {submitted && matches.error && (
        <p className="reply-notes-hint" style={{ color: 'var(--alert)' }}>
          Couldn't search. {refusalText(matches.error)}
        </p>
      )}
      {matches.data && matches.data.length === 0 && (
        <p className="reply-notes-hint">No writer whose letters your group mailed goes by “{submitted}”, now or before.</p>
      )}
      {matches.data && matches.data.length > 0 && (
        <table className="convo-table" style={{ marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th>Writer</th>
              <th>Matched</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {matches.data.map((m) => (
              <tr key={m.id} className="convo-row">
                <td>
                  <span className="convo-prisoner">{writerLabel(m, `Writer ${m.id}`)}</span>
                </td>
                <td>
                  <span className="convo-facility">
                    {m.matched.current ? 'their pen name' : `a pen name they used before: “${m.matched.name}”`}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-pressed={writer?.id === m.id}
                    onClick={() => {
                      onTarget(null)
                      setWriter(m)
                    }}
                  >
                    {writer?.id === m.id ? 'Chosen' : 'Choose'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {writer && (
        <div style={{ marginTop: '1rem' }}>
          <div className="thread-sidebar-heading">Who wrote the reply?</div>
          {threads.loading && <p className="reply-notes-hint">Loading their conversations…</p>}
          {threads.error && (
            <p className="reply-notes-hint" style={{ color: 'var(--alert)' }}>
              Couldn't load their conversations. {refusalText(threads.error)}
            </p>
          )}
          {threads.data && threads.data.length === 0 && (
            <p className="reply-notes-hint">Your group can't see any of their conversations.</p>
          )}
          {threads.data && threads.data.length > 0 && (
            <table className="convo-table">
              <tbody>
                {threads.data.map((chat) => (
                  <tr key={chat.id} className="convo-row">
                    <td>
                      <span className="convo-prisoner">{threadPrisonerName(chat)}</span>
                      {chat.prisoner_details?.prison_details && (
                        <div className="convo-facility">{chat.prisoner_details.prison_details.prisonName}</div>
                      )}
                    </td>
                    <td>
                      <button type="button" className="btn btn-sm" onClick={() => choose(chat)}>
                        Record a reply from them
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </form>
  )
}

export default function RecordReply() {
  const [params, setParams] = useSearchParams()
  // ?reply=<reference> from the print page: look it up straight away.
  const initial = params.get('reply') ?? ''
  const [mode, setMode] = useState<'reference' | 'name'>('reference')
  const [target, setTarget] = useState<Target | null>(null)
  const [recorded, setRecorded] = useState<(RecordedReply & { target: Target }) | null>(null)
  // A fresh start ("Record another reply") remounts step 1.
  const [round, setRound] = useState(0)

  function startAgain() {
    setRecorded(null)
    setTarget(null)
    setMode('reference')
    setRound((n) => n + 1)
    if (params.has('reply')) setParams({}, { replace: true })
  }

  return (
    <div className="app-wrap">
      <div className="app-layout">
        <main className="thread-main">
          <div className="thread-header">
            <Link to="/inbox" className="thread-back">
              ← Back to inbox
            </Link>
            <h1 className="thread-title">Record a reply</h1>
            <div className="thread-meta">
              <span>A prisoner's reply that came to your group: type it, scan it, or both.</span>
            </div>
          </div>

          {recorded ? (
            <div className="reply-panel">
              <div className="reply-panel-header">
                <span className="reply-panel-title">Reply recorded</span>
              </div>
              <div className="reply-panel-body">
                <p>
                  {recorded.target.prisoner.name}'s reply is in their conversation with {recorded.target.writer.name}.
                </p>
                {!recorded.sealedToWriter && !recorded.target.writer.anonymous && (
                  <p className="reply-notes-hint">
                    {recorded.target.writer.name} hasn't set up their keys yet, so it is sealed to your group only. They will be able
                    to read it once they set up their keys and a group admin of your group signs in.
                  </p>
                )}
              </div>
              <div className="reply-panel-footer">
                <Link to={`/threads/${recorded.message.chat}`} className="btn btn-primary btn-sm">
                  Open the conversation
                </Link>
                <button type="button" className="btn btn-sm" onClick={startAgain}>
                  Record another reply
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="reply-panel" style={{ marginTop: 0 }}>
                <div className="reply-panel-header">
                  <span className="reply-panel-title">1 · Whose reply is it?</span>
                  <span className="reply-submit-note" style={{ flex: 'none', alignSelf: 'center' }}>
                    <button
                      type="button"
                      className="reply-notes-toggle"
                      onClick={() => {
                        setMode(mode === 'reference' ? 'name' : 'reference')
                        setTarget(null)
                      }}
                    >
                      {mode === 'reference' ? 'No number? Find the writer by name' : 'Use the reply reference instead'}
                    </button>
                  </span>
                </div>
                {mode === 'reference' ? (
                  <ByReference key={`ref-${round}`} initial={round === 0 ? initial : ''} onTarget={setTarget} />
                ) : (
                  <ByName key={`name-${round}`} onTarget={setTarget} />
                )}
              </div>

              {target && (
                <RecordReplyPanel
                  key={`${target.writer.id}-${target.prisoner.id}-${target.reference ?? ''}`}
                  writer={target.writer}
                  prisoner={target.prisoner}
                  reference={target.reference}
                  onRecorded={(reply) => setRecorded({ ...reply, target })}
                />
              )}
            </>
          )}
        </main>

        <aside className="thread-sidebar">
          <div className="thread-sidebar-section">
            <div className="thread-sidebar-heading">The reply reference</div>
            <div className="thread-sidebar-info">
              Every letter your group prints ends with a footer asking the prisoner to write a nine-digit number, like{' '}
              <strong>{REFERENCE_EXAMPLE}</strong>, at the top of their reply. It finds the writer and the letter it answers.
            </div>
          </div>
          <hr className="thread-sidebar-divider" />
          <div className="thread-sidebar-section">
            <div className="thread-sidebar-heading">No number?</div>
            <div className="thread-sidebar-info">
              Search by the name the reply is addressed to. A writer who changed their pen name is still found by the old one.
            </div>
          </div>
          <hr className="thread-sidebar-divider" />
          <div className="thread-sidebar-section">
            <div className="thread-sidebar-heading">Who can read it</div>
            <div className="thread-sidebar-info">
              The transcription and the scan are encrypted in this browser for the writer and your group. Nobody else, site
              admins included, can read them.
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
