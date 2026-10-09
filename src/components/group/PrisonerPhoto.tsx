import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl, toApiError } from '../../api/client'
import { getPrisoner, PHOTO_MAX_BYTES, PHOTO_TYPES, removePrisonerPhoto, uploadPrisonerPhoto } from '../../api/prisoners'
import { useApi } from '../../hooks/useApi'
import { useGatedGroup } from '../../hooks/useGroup'
import type { ApiError, Prisoner, PrisonerPhoto as Photo } from '../../types'
import { displayName } from '../../utils/prisoners'
import { commonRefusal, otherRefusal } from '../../utils/refusals'

// A supported prisoner's photo, from the group's settings page (README
// "Photos"; API #166: any group admin of an active group may add one). It is
// published at once, the one change a group makes to a record without
// moderation, so the group admin confirms first that the person agreed to it:
// consent comes through the group that knows them. The API checks nothing of
// the kind; this page is where it happens. No `credit` for a group.

/** A photo refusal in words, from the problem on `photo` (README "POST /prisoner/photo"). */
function photoRefusal(error: ApiError): string {
  const code = error.problems?.find((p) => p.field === 'photo')?.code
  if (error.status === 400 && code === 'not_allowed_value') return 'That file isn’t a JPEG, PNG or WebP picture.'
  if (error.status === 400 && code === 'out_of_range') return 'That picture is larger than 5 MB. Save a smaller copy and try again.'
  if (error.status === 400 && code === 'wrong_type')
    return 'That picture couldn’t be read to the end. Save it again (or take a screenshot of it) and upload that.'
  if (error.status === 403 && error.condition === null)
    return 'Your group can’t change photos right now: only an active group can, and yours may be waiting for approval, or suspended.'
  if (error.status === 404) return 'This prisoner’s record isn’t one your group can see any more.'
  return commonRefusal(error) ?? otherRefusal(error)
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

/** One prisoner's photo: the current one, a new one with the consent step, or taking it down. */
export function PrisonerPhoto({ prisoner, onClose }: { prisoner: Prisoner; onClose: () => void }) {
  // The record as it is now: the group's copy of it may be older than its photo.
  const record = useApi(() => getPrisoner(prisoner.id, false), [prisoner.id])
  const [photo, setPhoto] = useState<{ from: Photo | null; now: Photo | null } | null>(null)
  // The picture chosen, with an object URL for its preview, let go when another is chosen or the panel closes.
  const [chosen, setChosen] = useState<{ file: File; url: string } | null>(null)
  const file = chosen?.file ?? null
  const preview = chosen?.url ?? null
  const [agreed, setAgreed] = useState(false)
  // Bumped after an upload, so the file input lets go of the file it showed.
  const [inputKey, setInputKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const name = displayName(prisoner)

  const loaded = record.data?.photo ?? null
  // What this panel last did, while the record it was read from is still the one shown.
  const current = photo && photo.from === loaded ? photo.now : loaded

  useEffect(() => () => {
    if (chosen) URL.revokeObjectURL(chosen.url)
  }, [chosen])
  const setFile = (f: File | null) => setChosen(f ? { file: f, url: URL.createObjectURL(f) } : null)

  function choose(chosen: File | null) {
    setNote(null)
    setAgreed(false)
    if (!chosen) return setFile(null)
    if (!PHOTO_TYPES.includes(chosen.type)) {
      setFile(null)
      return setNote({ ok: false, text: 'Choose a JPEG, PNG or WebP picture.' })
    }
    if (chosen.size > PHOTO_MAX_BYTES) {
      setFile(null)
      return setNote({ ok: false, text: `That picture is larger than 5 MB (${megabytes(chosen.size)}). Save a smaller copy and try again.` })
    }
    setFile(chosen)
  }

  async function upload() {
    if (!file || !agreed) return
    setBusy(true)
    setNote(null)
    try {
      const done = await uploadPrisonerPhoto(prisoner.id, file)
      setPhoto({ from: loaded, now: done.photo })
      setFile(null)
      setInputKey((k) => k + 1)
      setAgreed(false)
      setNote({ ok: true, text: `The photo is up, and shows on ${name}’s public page now.` })
    } catch (err) {
      setNote({ ok: false, text: photoRefusal(toApiError(err)) })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Take ${name}’s photo down? It is deleted, and their public page shows no photo.`)) return
    setBusy(true)
    setNote(null)
    try {
      await removePrisonerPhoto(prisoner.id)
      setPhoto({ from: loaded, now: null })
      setNote({ ok: true, text: 'The photo is taken down and deleted.' })
    } catch (err) {
      setNote({ ok: false, text: photoRefusal(toApiError(err)) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-form" style={{ marginTop: '0.5rem' }}>
      {record.loading && !record.data && <p className="settings-static">Loading the record…</p>}
      {record.error && <p className="settings-alert settings-alert-err">Couldn’t load {name}’s record ({record.error.message}).</p>}
      {record.data && (
        <div className="settings-field">
          <span className="settings-label">Photo now</span>
          {current ? (
            <img src={apiUrl(current.url)} alt={`${name}, as shown on their public page`} style={{ maxWidth: '10rem', maxHeight: '12rem', display: 'block' }} />
          ) : (
            <span className="settings-static">No photo.</span>
          )}
          {current?.credit && <span className="settings-hint">Credit: {current.credit}</span>}
        </div>
      )}

      <div className="settings-field">
        <label className="settings-label" htmlFor={`photo-${prisoner.id}`}>
          {current ? 'Replace it with' : 'Add one'}
        </label>
        <input
          key={inputKey}
          id={`photo-${prisoner.id}`}
          type="file"
          accept={PHOTO_TYPES.join(',')}
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
        <span className="settings-hint">
          A JPEG, PNG or WebP picture, at most 5 MB. Turn it upright first: where and when it was taken, the camera, and the orientation tag are
          all removed before it’s stored, so a sideways photo shows sideways.
        </span>
        {preview && <img src={preview} alt="The picture chosen" style={{ maxWidth: '10rem', maxHeight: '12rem', display: 'block', marginTop: '0.5rem' }} />}
      </div>

      {file && (
        <>
          <label className="service-check">
            <input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => setAgreed(e.target.checked)} />
            <span>The person has agreed to this photo being shown.</span>
          </label>
          <p className="settings-hint">
            It goes on {name}’s public page as soon as it’s uploaded, without a site admin looking at it first: only upload a photo they have said
            yes to, through your group.
          </p>
        </>
      )}

      {note && (
        <div className={note.ok ? 'settings-alert settings-alert-ok' : 'settings-alert settings-alert-err'} role={note.ok ? 'status' : 'alert'}>
          {note.text}
          {note.ok && current && (
            <>
              {' '}
              <Link to={`/prisoners/${prisoner.id}`}>See the public page</Link>.
            </>
          )}
        </div>
      )}

      <div className="settings-save-row">
        <button type="button" className="settings-save-btn" disabled={!file || !agreed || busy} onClick={() => void upload()}>
          {busy && file ? 'Uploading…' : 'Upload the photo'}
        </button>
        {current && (
          <button type="button" className="settings-btn settings-btn-danger" disabled={busy} onClick={() => void remove()}>
            Take it down
          </button>
        )}
        <button type="button" className="settings-btn" disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

/**
 * The supported prisoners, each with a Photo button that opens the panel above.
 * A section of its own beside the Supports panel; the list is the group's
 * record, so a prisoner linked just now appears once the record is read again.
 */
export default function PrisonerPhotos() {
  const { group, reload } = useGatedGroup()
  const [open, setOpen] = useState<number | null>(null)
  const supported = group.supported_prisoners ?? []

  return (
    <section className="settings-section">
      <h2 className="settings-section-heading">Photos</h2>
      <p className="settings-hint">
        A photo of a prisoner your group supports, for their public page. Any group admin may add one, once the person has agreed to it.
      </p>
      {supported.length === 0 ? (
        <p className="settings-static">Link a prisoner under Supports first.</p>
      ) : (
        <ul className="settings-list">
          {supported.map((p) => (
            <li key={p.id} style={open === p.id ? { display: 'block' } : undefined}>
              <span className="settings-list-name">{displayName(p)}</span>{' '}
              {open !== p.id && <span className="settings-sub">{p.photo ? 'Has a photo' : 'No photo'}</span>}{' '}
              {open !== p.id && (
                <button type="button" className="settings-btn" onClick={() => setOpen(p.id)}>
                  Photo
                </button>
              )}
              {open === p.id && (
                <PrisonerPhoto
                  prisoner={p}
                  onClose={() => {
                    setOpen(null)
                    reload()
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="settings-hint">
        Linked someone just now?{' '}
        <button type="button" className="settings-link-button" onClick={reload}>
          Read the list again
        </button>
      </p>
    </section>
  )
}
