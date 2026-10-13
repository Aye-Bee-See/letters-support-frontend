import { useEffect, useRef, useState } from 'react'
import { toApiError } from '../api/client'
import { removePrisonerPhoto, uploadPrisonerPhoto } from '../api/prisoners'
import type { PrisonerPhoto } from '../types'
import { photoProblem, photoRefusal, type PhotoRole } from '../utils/photos'

/**
 * One prisoner's photo file, from choosing it to sending it: the file checked
 * for type and size before anything is sent, a preview whose object URL is let
 * go when another is chosen or the panel goes, the upload and the take-down,
 * and their busy, error and done state. The panel (PrisonerPhotoPanel) says
 * what is confirmed first and what `done` reads.
 *
 * `inputKey` goes on the file input: it changes when the file is let go, so the
 * input shows nothing chosen either.
 */
export function usePhotoFile(prisonerId: number, role: PhotoRole) {
  const [chosen, setChosen] = useState<{ file: File; preview: string } | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const previewRef = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  function setFile(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = next ? URL.createObjectURL(next) : null
    setChosen(next && previewRef.current ? { file: next, preview: previewRef.current } : null)
  }

  /** Let go of the chosen file, and empty the input. */
  function clear() {
    setFile(null)
    setInputKey((k) => k + 1)
  }

  /** A file from the input: kept if it passes the check, otherwise let go with the reason. */
  function choose(next: File | null) {
    setDone(null)
    setError(null)
    if (!next) return setFile(null)
    const problem = photoProblem(next)
    if (problem) {
      setError(problem)
      clear()
      return
    }
    setFile(next)
  }

  /** Send the chosen file; the new photo, or null after a refusal (said in `error`). */
  async function upload(credit?: string): Promise<PrisonerPhoto | null> {
    if (!chosen) return null
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await uploadPrisonerPhoto(prisonerId, chosen.file, credit)
      clear()
      return result.photo
    } catch (err) {
      setError(photoRefusal(toApiError(err), role))
      return null
    } finally {
      setBusy(false)
    }
  }

  /** Take the photo down; true once it is gone, false after a refusal (said in `error`). */
  async function remove(): Promise<boolean> {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await removePrisonerPhoto(prisonerId)
      return true
    } catch (err) {
      setError(photoRefusal(toApiError(err), role))
      return false
    } finally {
      setBusy(false)
    }
  }

  return { file: chosen?.file ?? null, preview: chosen?.preview ?? null, inputKey, busy, error, setError, done, setDone, choose, clear, upload, remove }
}
