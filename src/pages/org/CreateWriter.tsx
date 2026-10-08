import { useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PenNameField from '../../components/forms/PenNameField'
import { createKeyedWriter, describeWriterError } from '../../groups/writers'
import { useAuth } from '../../hooks/useAuth'
import { useGroup } from '../../hooks/useGroup'

// Markup and classes from solidarity-site/create-writer.html (pages/create-writer.css).
// A managed writer (README "Managed writers", "POST /auth/writer") is an account
// the group holds for someone who writes through it. In end-to-end mode the
// writer's keypair is made here and the private half sealed to the group key
// ("Managed writers and claiming"), so this needs the group key in this session.

const NAME_MIN = 3
const NAME_MAX = 32

export default function CreateWriter() {
  const navigate = useNavigate()
  const { groupKeypair } = useAuth()
  const { chapterId, keyState, keyVersion, group } = useGroup()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [managerNote, setManagerNote] = useState('')
  const [penName, setPenName] = useState('')
  const [penNameRefused, setPenNameRefused] = useState(false)
  const [saving, setSaving] = useState<'list' | 'handoff' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ready = keyState === 'ready' && groupKeypair !== null && chapterId !== null
  const trimmed = name.trim()
  const nameProblem = trimmed.length > 0 && (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) ? `A name is ${NAME_MIN} to ${NAME_MAX} characters.` : null
  const canSave = ready && trimmed.length >= NAME_MIN && !nameProblem && !penNameRefused && saving === null

  async function save(then: 'list' | 'handoff') {
    if (!canSave || !groupKeypair || chapterId === null) return
    setSaving(then)
    setError(null)
    try {
      const writer = await createKeyedWriter(
        chapterId,
        { publicKey: groupKeypair.publicKey, keyVersion },
        {
          name: trimmed,
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(managerNote.trim() ? { managerNote: managerNote.trim() } : {}),
          ...(penName.trim() ? { penName: penName.trim() } : {}),
        },
      )
      navigate(then === 'handoff' ? `/writers/${writer.id}/handoff` : '/inbox?tab=writers')
    } catch (err) {
      setError(describeWriterError(err))
      setSaving(null)
    }
  }

  function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    void save('list')
  }

  return (
    <div className="create-writer-wrap">
      <div className="create-writer-inner">
        <Link to="/inbox?tab=writers" className="create-writer-back">
          ← Your writers
        </Link>
        <h1 className="create-writer-title">Add a writer</h1>
        <p className="create-writer-subtitle">
          An account {group?.name ?? 'your group'} holds for someone who writes through you: at a letter-writing night, or
          someone who'd rather you handled everything. Replies to their letters come back to it. When they want it, hand it
          to them with a claim token; from then on it is theirs, and your group no longer sees it.
        </p>

        {!ready ? (
          <div className="cw-anon-note" role="status">
            <strong>Adding a writer needs the group key.</strong> Each writer's own key is made in this browser and locked
            with your group's key, so any group admin who holds it can write and print for them.{' '}
            {keyState === 'no-key' ? (
              <>
                Your group has no key yet: <Link to="/settings/keys">set it up</Link>.
              </>
            ) : (
              <>You don't hold it yet: the group-owner admin hands it to you.</>
            )}
          </div>
        ) : (
          <form className="cw-form" onSubmit={onSubmit} noValidate>
            <div className="cw-field">
              <label className="cw-label" htmlFor="cwName">
                Name
              </label>
              <input
                className="cw-input"
                id="cwName"
                type="text"
                maxLength={NAME_MAX}
                placeholder="e.g. Sam R."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
              <span className="cw-hint" style={nameProblem ? { color: 'var(--alert)' } : undefined}>
                {nameProblem ?? 'How your group knows them. Without a pen name, their letters are signed with this.'}
              </span>
            </div>

            <PenNameField
              idPrefix="cw"
              value={penName}
              refused={penNameRefused}
              onChange={(value, refused) => {
                setPenName(value)
                setPenNameRefused(refused)
              }}
              hint="Optional. The name their letters are signed with, and that a prisoner writes back to. They keep it when they claim the account, unless they choose another."
            />

            <div className="cw-field">
              <label className="cw-label" htmlFor="cwEmail">
                Email <span className="cw-label-optional">optional</span>
              </label>
              <input
                className="cw-input"
                id="cwEmail"
                type="email"
                placeholder="sam@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
              <span className="cw-hint">Nothing is sent to it. Without one, the account gets a placeholder address until they claim it.</span>
            </div>

            <div className="cw-field">
              <label className="cw-label" htmlFor="cwNote">
                Note for your group <span className="cw-label-optional">optional</span>
              </label>
              <textarea
                className="cw-textarea"
                id="cwNote"
                placeholder="e.g. Comes on Tuesdays; prefers we print in large type."
                value={managerNote}
                onChange={(e) => setManagerNote(e.target.value)}
              />
              <span className="cw-hint">Only your group's admins see this. Never the writer, never a prisoner.</span>
            </div>

            <div className="cw-anon-note">
              <strong>Writing for someone who doesn't want an account?</strong> Write anonymously from New Letter instead. The
              anonymous writer is shared by everyone your group writes for, and can never be handed to one person.
            </div>

            {error && (
              <p className="cw-hint" role="alert" style={{ color: 'var(--alert)' }}>
                <strong>Not saved.</strong> {error}
              </p>
            )}

            <hr className="cw-divider" />
            <div className="cw-actions">
              <button type="submit" className="cw-btn-primary" disabled={!canSave}>
                {saving === 'list' ? 'Adding…' : 'Add writer'}
                <span className="cw-btn-description">back to your writers</span>
              </button>
              <button type="button" className="cw-btn-secondary" disabled={!canSave} onClick={() => void save('handoff')}>
                {saving === 'handoff' ? 'Adding…' : 'Add and hand off now'}
                <span className="cw-btn-description">make their claim token next</span>
              </button>
              <Link to="/inbox?tab=writers" className="cw-cancel">
                Cancel
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
