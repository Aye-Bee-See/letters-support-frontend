import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '../../api/client'
import { PHOTO_MAX_BYTES, PHOTO_TYPES, removePrisonerPhoto, uploadPrisonerPhoto } from '../../api/prisoners'
import type { ApiError, Prisoner, PrisonerPhoto } from '../../types'
import { displayName } from '../../utils/prisoners'
import { date } from '../invitations/wording'
import { commonRefusal, otherRefusal } from '../../utils/refusals'
import { Field, Section } from '../forms/AdminFormParts'

// A prisoner's photo on the superadmin's edit page (README "Photos"; CHANGELOG
// #130, #151, #166): POST /prisoner/photo adds or replaces it, DELETE
// /prisoner/photo takes it down. A photo is published at once, the one part of
// a record that skips moderation, so the uploader confirms first: for a
// superadmin, that it comes from a public support page the person's supporters
// published, named in `credit`. The API checks none of that; this form is where
// it happens. The panel keeps its own copy of the photo, apart from Save, so an
// upload doesn't reload the record and drop unsaved edits in the form above.

const MAX_MB = PHOTO_MAX_BYTES / (1024 * 1024)
const CREDIT_MAX = 200

/** What is wrong with a chosen file before it is sent, or null. The API reads the type from the bytes; this catches the obvious. */
function fileProblem(file: File): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return 'Choose a JPEG, PNG or WebP image: this file is none of the three.'
  if (file.size > PHOTO_MAX_BYTES)
    return `This file is ${(file.size / (1024 * 1024)).toFixed(1)} MB; a photo can be at most ${MAX_MB} MB. Save a smaller copy and choose that.`
  return null
}

/** A refusal from either call, worded from status, name and the 400's codes (README "Errors"). */
function photoRefusal(error: ApiError): string {
  if (error.status === 403) return 'The server says this account may not change photos. Sign in again as a site admin and try once more.'
  if (error.status === 400) {
    const problem = error.problems?.find((p) => p.field === 'photo')
    if (problem?.code === 'not_allowed_value') return 'The server read this file and it isn’t a JPEG, PNG or WebP image. Choose another.'
    if (problem?.code === 'out_of_range') return `The file is larger than ${MAX_MB} MB. Save a smaller copy and choose that.`
    if (problem?.code === 'wrong_type')
      return 'The server couldn’t read this file from end to end, so it wasn’t stored. Open it and save it again (or take a screenshot of it), then choose that.'
  }
  return commonRefusal(error) ?? otherRefusal(error)
}

/** `onChanged` runs after a photo goes up or comes down, e.g. for the page's history to ask again. */
export default function PhotoPanel({ prisoner, onChanged }: { prisoner: Prisoner; onChanged?: () => void }) {
  const [photo, setPhoto] = useState<PrisonerPhoto | null>(prisoner.photo)
  // The chosen file and its preview's object URL, revoked when it is replaced or the panel goes.
  const [chosen, setChosen] = useState<{ file: File; preview: string } | null>(null)
  const file = chosen?.file ?? null
  const preview = chosen?.preview ?? null
  const [credit, setCredit] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const name = displayName(prisoner)

  const previewRef = useRef<string | null>(null)
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  function setFile(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = next ? URL.createObjectURL(next) : null
    setChosen(next && previewRef.current ? { file: next, preview: previewRef.current } : null)
  }

  function clearFile() {
    setFile(null)
    if (input.current) input.current.value = ''
  }

  function choose(next: File | null) {
    setDone(null)
    setError(null)
    if (!next) return setFile(null)
    const problem = fileProblem(next)
    if (problem) {
      setError(problem)
      clearFile()
      return
    }
    setFile(next)
  }

  function reset() {
    clearFile()
    setCredit('')
    setConfirmed(false)
  }

  async function upload() {
    if (!file) return
    if (!credit.trim()) return setError('Name the public support page this photo comes from: it is shown beside the picture.')
    if (!confirmed) return setError('Confirm where the photo comes from before uploading it.')
    const replacing = photo !== null
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await uploadPrisonerPhoto(prisoner.id, file, credit.trim())
      setPhoto(result.photo)
      reset()
      setDone(replacing ? 'Photo replaced. The new one is public now.' : 'Photo added. It is public now.')
      onChanged?.()
    } catch (err) {
      setError(photoRefusal(err as ApiError))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Take ${name}’s photo down? The file is deleted, and the photo leaves the directory at once.`)) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await removePrisonerPhoto(prisoner.id)
      setPhoto(null)
      setDone('Photo taken down.')
      onChanged?.()
    } catch (err) {
      setError(photoRefusal(err as ApiError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-form relay-panel">
      <Section title="Photo">
        <p className="form-hint">
          A photo is public as soon as it is uploaded, without going through the moderation queue, and replaces any photo the record has. Uploading and
          taking down happen straight away, without Save.
          {prisoner.recordStatus && prisoner.recordStatus !== 'published' && ' While the record isn’t published, only staff can see it.'}
        </p>

        {photo ? (
          <figure>
            {/* Sized inline. */}
            <img src={apiUrl(photo.url)} alt={name} style={{ display: 'block', maxWidth: '220px', maxHeight: '280px', height: 'auto' }} />
            <figcaption className="form-hint">
              {photo.credit ? `Photo: ${photo.credit}.` : 'No credit given.'} Added {date(photo.updatedAt)}.
            </figcaption>
          </figure>
        ) : (
          <p className="form-static">No photo.</p>
        )}

        {photo && (
          <div className="queue-item-actions">
            <button type="button" className="a-btn a-btn-danger a-btn-sm" disabled={busy} onClick={() => void remove()}>
              Take the photo down
            </button>
          </div>
        )}

        <Field
          label={photo ? 'Replace it with' : 'Add a photo'}
          htmlFor="photo-file"
          hint={`A JPEG, PNG or WebP image, at most ${MAX_MB} MB. Turn it the right way up first: the site removes everything stored inside the file, including which way up it was taken, and never rotates a picture, so a sideways photo shows sideways.`}
        >
          <input
            ref={input}
            id="photo-file"
            type="file"
            className="form-input"
            accept={PHOTO_TYPES.join(',')}
            disabled={busy}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
          />
        </Field>

        {file && (
          <>
            {preview && <img src={preview} alt="The photo chosen" style={{ display: 'block', maxWidth: '160px', maxHeight: '200px', height: 'auto' }} />}
            <Field label="Credit" htmlFor="photo-credit" hint="The public support page it comes from, named as it names itself. Shown beside the picture.">
              <input
                id="photo-credit"
                className="form-input"
                value={credit}
                maxLength={CREDIT_MAX}
                required
                disabled={busy}
                onChange={(e) => setCredit(e.target.value)}
              />
            </Field>
            <label className="queue-check">
              <input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />
              This photo comes from a public support page the person’s supporters published.
            </label>
            <div className="queue-item-actions">
              <button type="button" className="a-btn a-btn-primary a-btn-sm" disabled={busy || !credit.trim() || !confirmed} onClick={() => void upload()}>
                {busy ? 'Uploading…' : photo ? 'Replace photo' : 'Upload photo'}
              </button>
              <button type="button" className="a-btn a-btn-sm" disabled={busy} onClick={reset}>
                Cancel
              </button>
            </div>
          </>
        )}

        {error && <div className="admin-alert admin-alert-err" role="alert">{error}</div>}
        {done && <div className="admin-alert admin-alert-ok" role="status">{done}</div>}
      </Section>
    </div>
  )
}
