import { describe, expect, it } from 'vitest'
import { PHOTO_MAX_BYTES } from '../api/prisoners'
import type { ApiError } from '../types'
import { PHOTO_MAX_MB, photoProblem, photoRefusal } from './photos'

const refusal = (status: number, extra: Partial<ApiError> = {}) => ({ status, name: 'Error', condition: null, errors: [], message: '', ...extra }) as ApiError

describe('photoProblem', () => {
  it('takes a JPEG, PNG or WebP up to the API’s limit', () => {
    expect(photoProblem({ type: 'image/webp', size: PHOTO_MAX_BYTES })).toBeNull()
    expect(photoProblem({ type: 'image/gif', size: 10 })).toMatch(/JPEG, PNG or WebP/)
    expect(photoProblem({ type: 'image/png', size: PHOTO_MAX_BYTES + 1 })).toMatch(`at most ${PHOTO_MAX_MB} MB`)
  })
})

describe('photoRefusal', () => {
  it('words the 400’s codes alike for both roles', () => {
    const tooBig = refusal(400, { problems: [{ field: 'photo', code: 'out_of_range' }] } as Partial<ApiError>)
    expect(photoRefusal(tooBig, 'admin')).toBe(`The file is larger than ${PHOTO_MAX_MB} MB. Save a smaller copy and choose that.`)
    expect(photoRefusal(tooBig, 'group')).toBe(photoRefusal(tooBig, 'admin'))
  })

  it('says a 403 in each role’s terms', () => {
    expect(photoRefusal(refusal(403), 'admin')).toMatch(/as a site admin/)
    expect(photoRefusal(refusal(403, { name: 'AuthorizationError', condition: 'group_suspended' }), 'group')).toMatch(/^Your group has been suspended/)
    expect(photoRefusal(refusal(404), 'group')).toMatch(/isn’t one your group can see/)
  })
})
