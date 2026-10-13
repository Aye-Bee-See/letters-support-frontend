import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl } from '../../api/client'
import { getPrisoner, PHOTO_TYPES } from '../../api/prisoners'
import { useApi } from '../../hooks/useApi'
import { usePhotoFile } from '../../hooks/usePhotoFile'
import type { Prisoner, PrisonerPhoto } from '../../types'
import { PHOTO_MAX_MB, type PhotoRole } from '../../utils/photos'
import { displayName } from '../../utils/prisoners'
import { refusalText } from '../../utils/refusals'
import { shortDate } from '../../utils/dates'
import { Field, Section } from './ClassedParts'
import { ADMIN_UI, GROUP_UI, type UiClasses } from './uiClasses'

// A prisoner's photo (README "Photos"; CHANGELOG #130, #151, #166): POST
// /prisoner/photo adds or replaces it, DELETE /prisoner/photo takes it down. A
// photo is published at once, the one part of a record that skips moderation,
// so the uploader confirms first, in their role's words: a site admin (mode
// "admin", on the record's edit page) that it comes from a public support page
// the person's supporters published, named in `credit`; a group admin (mode
// "group", on the group's settings page) that the person agreed to it, consent
// coming through the group that knows them, with no credit. The API checks none
// of that; this panel is where it happens.
//
// The panel keeps what it last did apart from the record it was given, so an
// upload doesn't reload the record and drop unsaved edits in a form beside it;
// a group admin's panel reads the record afresh, as the group's copy of it may
// be older than its photo.

const CLASSES: Record<PhotoRole, UiClasses & { actions: string }> = {
  admin: { ...ADMIN_UI, primaryButton: 'a-btn a-btn-primary a-btn-sm', actions: 'queue-item-actions' },
  group: { ...GROUP_UI, actions: 'settings-save-row' },
}
const IMAGE: Record<PhotoRole, { shown: CSSProperties; preview: CSSProperties }> = {
  admin: {
    shown: { display: 'block', maxWidth: '220px', maxHeight: '280px', height: 'auto' },
    preview: { display: 'block', maxWidth: '160px', maxHeight: '200px', height: 'auto' },
  },
  group: {
    shown: { display: 'block', maxWidth: '10rem', maxHeight: '12rem' },
    preview: { display: 'block', maxWidth: '10rem', maxHeight: '12rem', marginTop: '0.5rem' },
  },
}
const CREDIT_MAX = 200

interface Props {
  mode: PhotoRole
  prisoner: Prisoner
  /** After a photo goes up or comes down, e.g. for the page's history to ask again. */
  onChanged?: () => void
  /** A Close button, for a panel opened from a list. */
  onClose?: () => void
}

export default function PrisonerPhotoPanel({ mode, prisoner, onChanged, onClose }: Props) {
  const c = CLASSES[mode]
  const name = displayName(prisoner)
  const fresh = useApi(() => (mode === 'group' ? getPrisoner(prisoner.id, false) : Promise.resolve(null)), [mode, prisoner.id])
  const record = mode === 'group' ? fresh.data : prisoner
  const loaded = record?.photo ?? null
  // What this panel last did, while the record it was read from is still the one shown.
  const [photo, setPhoto] = useState<{ from: PrisonerPhoto | null; now: PrisonerPhoto | null } | null>(null)
  const current = photo && photo.from === loaded ? photo.now : loaded

  const f = usePhotoFile(prisoner.id, mode)
  const [credit, setCredit] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const ready = confirmed && (mode === 'group' || credit.trim() !== '')

  function choose(next: File | null) {
    // A confirmation is for one picture: another file asks again.
    setConfirmed(false)
    f.choose(next)
  }

  function cancel() {
    f.clear()
    setCredit('')
    setConfirmed(false)
  }

  async function upload() {
    if (!f.file) return
    if (mode === 'admin' && !credit.trim()) return f.setError('Name the public support page this photo comes from: it is shown beside the picture.')
    if (!confirmed) return f.setError(mode === 'admin' ? 'Confirm where the photo comes from before uploading it.' : 'Confirm the person agreed to this photo before uploading it.')
    const replacing = current !== null
    const now = await f.upload(mode === 'admin' ? credit.trim() : undefined)
    if (!now) return
    setPhoto({ from: loaded, now })
    setCredit('')
    setConfirmed(false)
    f.setDone(
      mode === 'group'
        ? `The photo is up, and shows on ${name}’s public page now.`
        : replacing
          ? 'Photo replaced. The new one is public now.'
          : 'Photo added. It is public now.',
    )
    onChanged?.()
  }

  async function remove() {
    const question =
      mode === 'group'
        ? `Take ${name}’s photo down? It is deleted, and their public page shows no photo.`
        : `Take ${name}’s photo down? The file is deleted, and the photo leaves the directory at once.`
    if (!window.confirm(question)) return
    if (!(await f.remove())) return
    setPhoto({ from: loaded, now: null })
    f.setDone(mode === 'group' ? 'The photo is taken down and deleted.' : 'Photo taken down.')
    onChanged?.()
  }

  const inputId = `photo-${prisoner.id}`
  const body = (
    <>
      {mode === 'admin' && (
        <p className={c.hint}>
          A photo is public as soon as it is uploaded, without going through the moderation queue, and replaces any photo the record has. Uploading and
          taking down happen straight away, without Save.
          {prisoner.recordStatus && prisoner.recordStatus !== 'published' && ' While the record isn’t published, only staff can see it.'}
        </p>
      )}
      {mode === 'group' && fresh.loading && <p className={c.static}>Loading the record…</p>}
      {mode === 'group' && fresh.error && <p className={c.alertErr}>Couldn’t load {name}’s record ({refusalText(fresh.error)}).</p>}

      {record && (
        <div className={c.field}>
          <span className={c.label}>Photo now</span>
          {current ? (
            <img src={apiUrl(current.url)} alt={`${name}, as shown on their public page`} style={IMAGE[mode].shown} />
          ) : (
            <span className={c.static}>No photo.</span>
          )}
          {current && (
            <span className={c.hint}>
              {[current.credit ? `Photo: ${current.credit}.` : mode === 'admin' ? 'No credit given.' : '', `Added ${shortDate(current.updatedAt)}.`]
                .filter(Boolean)
                .join(' ')}
            </span>
          )}
        </div>
      )}

      <Field
        classes={c}
        label={current ? 'Replace it with' : 'Add a photo'}
        htmlFor={inputId}
        hint={`A JPEG, PNG or WebP image, at most ${PHOTO_MAX_MB} MB. Turn it the right way up first: the site removes everything stored inside the file, including which way up it was taken, and never rotates a picture, so a sideways photo shows sideways.`}
      >
        <input
          key={f.inputKey}
          id={inputId}
          type="file"
          className={mode === 'admin' ? c.input : undefined}
          accept={PHOTO_TYPES.join(',')}
          disabled={f.busy}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
      </Field>

      {f.file && (
        <>
          {f.preview && <img src={f.preview} alt="The photo chosen" style={IMAGE[mode].preview} />}
          {mode === 'admin' && (
            <Field classes={c} label="Credit" htmlFor="photo-credit" hint="The public support page it comes from, named as it names itself. Shown beside the picture.">
              <input
                id="photo-credit"
                className={c.input}
                value={credit}
                maxLength={CREDIT_MAX}
                required
                disabled={f.busy}
                onChange={(e) => setCredit(e.target.value)}
              />
            </Field>
          )}
          <label className={c.check}>
            <input type="checkbox" checked={confirmed} disabled={f.busy} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>
              {mode === 'admin' ? 'This photo comes from a public support page the person’s supporters published.' : 'The person has agreed to this photo being shown.'}
            </span>
          </label>
          {mode === 'group' && (
            <p className={c.hint}>
              It goes on {name}’s public page as soon as it’s uploaded, without a site admin looking at it first: only upload a photo they have said yes
              to, through your group.
            </p>
          )}
        </>
      )}

      {f.error && (
        <div className={c.alertErr} role="alert">
          {f.error}
        </div>
      )}
      {f.done && (
        <div className={c.alertOk} role="status">
          {f.done}
          {mode === 'group' && current && (
            <>
              {' '}
              <Link to={`/prisoners/${prisoner.id}`}>See the public page</Link>.
            </>
          )}
        </div>
      )}

      <div className={c.actions}>
        <button type="button" className={c.primaryButton} disabled={!f.file || !ready || f.busy} onClick={() => void upload()}>
          {f.busy && f.file ? 'Uploading…' : current ? 'Replace photo' : 'Upload photo'}
        </button>
        {f.file && (
          <button type="button" className={c.button} disabled={f.busy} onClick={cancel}>
            Cancel
          </button>
        )}
        {current && (
          <button type="button" className={c.dangerButton} disabled={f.busy} onClick={() => void remove()}>
            Take the photo down
          </button>
        )}
        {onClose && (
          <button type="button" className={c.button} disabled={f.busy} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </>
  )

  return mode === 'admin' ? (
    <div className={c.panel}>
      <Section classes={c} title="Photo">
        {body}
      </Section>
    </div>
  ) : (
    <div className={c.body} style={{ marginTop: '0.5rem' }}>
      {body}
    </div>
  )
}
