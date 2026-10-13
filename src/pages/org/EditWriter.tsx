import { useState, type SubmitEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { deleteWriter, updateWriter, type WriterFields } from '../../api/writers'
import PenNameField from '../../components/forms/PenNameField'
import LoadState from '../../components/ui/LoadState'
import { describeWriterError, isAnonymousWriter } from '../../groups/writers'
import { writerLabel } from '../../utils/groupLetters'
import { useManagedWriter } from '../../hooks/useManagedWriter'
import type { Writer } from '../../types'

// Editing one of the group's unclaimed writers (README "PUT /auth/user": a
// group may change its unclaimed writers' name, email, note and pen name; "Pen
// names": a group may rename them past the limits a writer has) and deleting
// one ("DELETE /auth/user": the account and everything written through it).
// Form classes from create-writer.css, the danger zone from org-settings.css.

const NAME_MIN = 3
const NAME_MAX = 32
/** The address the API gives a writer made without one (README "Managed writers"). */
const isPlaceholderEmail = (email: string) => email.endsWith('@managed.example')

export default function EditWriter() {
  const id = Number(useParams().id) || null
  const { writer, missing, loading, error, reload } = useManagedWriter(id)
  const [deleted, setDeleted] = useState<{ name: string; letters: number; replies: number; threads: number } | null>(null)

  if (deleted) {
    return (
      <Page>
        <title>Writer deleted · letters.support</title>
        <h1 className="create-writer-title">Writer deleted</h1>
        <p className="create-writer-subtitle">
          {deleted.name}'s account is gone, with {count(deleted.letters, 'letter')}, {count(deleted.replies, 'reply', 'replies')} and{' '}
          {count(deleted.threads, 'thread')}.
        </p>
      </Page>
    )
  }

  if (!writer) {
    return (
      <Page>
        <title>Edit writer · letters.support</title>
        <h1 className="create-writer-title">Edit writer</h1>
        {missing ? (
          <p className="create-writer-subtitle">
            This writer is no longer one of your group's: they may have claimed their account, or been deleted.
          </p>
        ) : (
          <LoadState state={{ data: writer, error, loading, reload }} what="this writer" />
        )}
      </Page>
    )
  }

  if (isAnonymousWriter(writer)) {
    return (
      <Page>
        <title>Anonymous writer · letters.support</title>
        <h1 className="create-writer-title">Anonymous writer</h1>
        <div className="cw-anon-note">
          <strong>This is your group's anonymous writer,</strong> shared by everyone your group writes for anonymously. It
          keeps its name, it can't be handed off, and it can't be deleted: it holds all of their letters.
        </div>
      </Page>
    )
  }

  return <EditForm key={writer.id} writer={writer} onDeleted={setDeleted} />
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="create-writer-wrap">
      <title>Edit writer · letters.support</title>
      <div className="create-writer-inner">
        <Link to="/inbox?tab=writers" className="create-writer-back">
          ← Your writers
        </Link>
        {children}
      </div>
    </div>
  )
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function EditForm({
  writer: loaded,
  onDeleted,
}: {
  writer: Writer
  onDeleted: (d: { name: string; letters: number; replies: number; threads: number }) => void
}) {
  // What the API holds: the loaded record, with each save applied to it.
  const [writer, setWriter] = useState(loaded)
  const label = writerLabel(writer)
  const placeholderEmail = isPlaceholderEmail(writer.email)
  const [name, setName] = useState(writer.name ?? '')
  const [penName, setPenName] = useState(writer.penName ?? '')
  const [penNameRefused, setPenNameRefused] = useState(false)
  const [email, setEmail] = useState(placeholderEmail ? '' : writer.email)
  const [managerNote, setManagerNote] = useState(writer.managerNote ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedName = name.trim()
  const nameProblem = trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX ? `A name is ${NAME_MIN} to ${NAME_MAX} characters.` : null

  /** Only what changed goes to the API. */
  const changes: WriterFields = {}
  if (trimmedName !== (writer.name ?? '')) changes.name = trimmedName
  // A pen name can be changed, not removed; the API stores it with single spaces.
  if (penName.trim() && penName.trim().replace(/\s+/g, ' ') !== (writer.penName ?? '')) changes.penName = penName.trim()
  if (email.trim() && email.trim() !== writer.email) changes.email = email.trim()
  if (managerNote.trim() !== (writer.managerNote ?? '').trim()) changes.managerNote = managerNote.trim() || null
  // Cleared: nothing would be sent for it, so Save would keep the old one without a word. Say so, and wait.
  const penNameCleared = Boolean(writer.penName) && !penName.trim()
  const dirty = Object.keys(changes).length > 0 || penNameCleared
  const canSave = dirty && !nameProblem && !penNameRefused && !penNameCleared && !saving

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateWriter(writer.id, changes)
      setWriter({
        ...writer,
        ...changes,
        ...(changes.penName ? { penName: changes.penName.replace(/\s+/g, ' ') } : {}),
      } as Writer)
      setSaved(true)
    } catch (err) {
      setError(describeWriterError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page>
      <h1 className="create-writer-title">Edit writer</h1>
      <p className="create-writer-subtitle">
        {label}, one of your group's writers. Until they claim the account, your group keeps these details.{' '}
        <Link to={`/writers/${writer.id}/handoff`}>Hand off the account</Link>
      </p>

      <form className="cw-form" onSubmit={onSubmit} noValidate>
        <div className="cw-field">
          <label className="cw-label" htmlFor="ewName">
            Name
          </label>
          <input className="cw-input" id="ewName" type="text" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
          <span className="cw-hint" style={nameProblem ? { color: 'var(--alert)' } : undefined}>
            {nameProblem ?? 'How your group knows them. Without a pen name, their letters are signed with this.'}
          </span>
        </div>

        <PenNameField
          idPrefix="ew"
          value={penName}
          refused={penNameRefused}
          ownName={writer.penName}
          onChange={(value, refused) => {
            setPenName(value)
            setPenNameRefused(refused)
          }}
          hint={
            writer.penName
              ? 'Your group may rename a writer it looks after whenever it needs to; the old name stays theirs, so replies addressed to it still find them.'
              : 'Optional. The name their letters are signed with, and that a prisoner writes back to.'
          }
        />

        <div className="cw-field">
          <label className="cw-label" htmlFor="ewEmail">
            Email <span className="cw-label-optional">optional</span>
          </label>
          <input
            className="cw-input"
            id="ewEmail"
            type="email"
            placeholder={placeholderEmail ? 'None yet' : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="cw-hint">
            {placeholderEmail
              ? 'Nothing is sent to it. Without one, the account keeps a placeholder address until they claim it.'
              : 'Nothing is sent to it. It can be changed, not removed.'}
          </span>
        </div>

        <div className="cw-field">
          <label className="cw-label" htmlFor="ewNote">
            Note for your group <span className="cw-label-optional">optional</span>
          </label>
          <textarea className="cw-textarea" id="ewNote" value={managerNote} onChange={(e) => setManagerNote(e.target.value)} />
          <span className="cw-hint">Only your group's admins see this. Never the writer, never a prisoner.</span>
        </div>

        {error && (
          <p className="cw-hint" role="alert" style={{ color: 'var(--alert)' }}>
            <strong>Not saved.</strong> {error}
          </p>
        )}

        <div className="settings-save-row">
          <button type="submit" className="settings-save-btn" disabled={!canSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <span className={saved && !dirty ? 'settings-saved-note is-visible' : 'settings-saved-note'}>Saved.</span>
        </div>
        {penNameCleared && (
          <p className="cw-hint" role="status">
            A pen name can be changed but not removed: type a new one, or put back “{writer.penName}”, to save.
          </p>
        )}
      </form>

      <hr className="cw-divider" style={{ margin: '2.5rem 0 1.5rem' }} />
      <DeleteWriter writer={writer} label={label} onDeleted={onDeleted} />
    </Page>
  )
}

function DeleteWriter({
  writer,
  label,
  onDeleted,
}: {
  writer: Writer
  label: string
  onDeleted: (d: { name: string; letters: number; replies: number; threads: number }) => void
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmed = typed.trim().toLowerCase() === label.trim().toLowerCase()

  async function remove() {
    if (!confirmed || busy) return
    setBusy(true)
    setError(null)
    try {
      const report = await deleteWriter(writer.id)
      onDeleted({ name: label, letters: report.letters, replies: report.replies, threads: report.threads })
    } catch (err) {
      setError(describeWriterError(err))
      setBusy(false)
    }
  }

  return (
    <div className="danger-zone">
      <div className="danger-zone-title">Delete this writer</div>
      <div className="danger-zone-body">
        Deletes {label}'s account <strong>and everything written through it</strong>: every letter, whether queued, printed or
        mailed; every reply recorded for them; their scans and photos; and their threads. It can't be undone, and nothing is
        kept. If {label} may want their letters, hand the account off instead.
      </div>
      {!open ? (
        <button type="button" className="danger-btn" onClick={() => setOpen(true)}>
          Delete {label}…
        </button>
      ) : (
        <div className="cw-field">
          <label className="cw-label" htmlFor="ewDelete">
            Type “{label}” to confirm
          </label>
          <input className="cw-input" id="ewDelete" type="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <button type="button" className="danger-btn" disabled={!confirmed || busy} onClick={() => void remove()}>
              {busy ? 'Deleting…' : 'Delete for good'}
            </button>
            <button
              type="button"
              className="cw-cancel"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => {
                setOpen(false)
                setTyped('')
              }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="cw-hint" role="alert" style={{ color: 'var(--alert)' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
