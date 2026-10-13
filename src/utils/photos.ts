import { PHOTO_MAX_BYTES, PHOTO_TYPES } from '../api/prisoners'
import type { ApiError } from '../types'
import { commonRefusal, otherRefusal } from './refusals'

// A prisoner's photo in words (README "Photos"): what is wrong with a file
// before it is sent, and a refusal from POST or DELETE /prisoner/photo. Shared
// by the site admin's and a group admin's photo panel
// (components/forms/PrisonerPhotoPanel.tsx).

/** Who is changing the photo: a site admin on the record's edit page, or a group admin for a prisoner the group supports. */
export type PhotoRole = 'admin' | 'group'

/** The largest photo, in MB as people say it (5). */
export const PHOTO_MAX_MB = PHOTO_MAX_BYTES / (1024 * 1024)

/** What is wrong with a chosen file before it is sent, or null. The API reads the type from the bytes; this catches the obvious. */
export function photoProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return 'Choose a JPEG, PNG or WebP image: this file is none of the three.'
  if (file.size > PHOTO_MAX_BYTES)
    return `This file is ${(file.size / (1024 * 1024)).toFixed(1)} MB; a photo can be at most ${PHOTO_MAX_MB} MB. Save a smaller copy and choose that.`
  return null
}

/** A refusal from either call, worded from status, name and the 400's codes (README "Errors"). */
export function photoRefusal(error: ApiError, role: PhotoRole): string {
  const code = error.status === 400 ? error.problems?.find((p) => p.field === 'photo')?.code : undefined
  if (code === 'not_allowed_value') return 'The server read this file and it isn’t a JPEG, PNG or WebP image. Choose another.'
  if (code === 'out_of_range') return `The file is larger than ${PHOTO_MAX_MB} MB. Save a smaller copy and choose that.`
  if (code === 'wrong_type')
    return 'The server couldn’t read this file from end to end, so it wasn’t stored. Open it and save it again (or take a screenshot of it), then choose that.'
  if (role === 'admin' && error.status === 403)
    return 'The server says this account may not change photos. Sign in again as a site admin and try once more.'
  if (role === 'group' && error.status === 403 && error.condition === null)
    return 'Your group can’t change photos right now: only an active group can, and yours may be waiting for approval, or suspended.'
  if (role === 'group' && error.status === 404) return 'This prisoner’s record isn’t one your group can see any more.'
  return commonRefusal(error) ?? otherRefusal(error)
}
