import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiUrl } from '../api/client'
import { FakeResponse, fakeApi } from '../test/fakeApi'
import { renderApp } from '../test/render'
import { TEST_TOKEN } from '../test/session'
import { usePhotoSrc } from './usePhotoSrc'

// A prisoner photo on a staff page: a published record's by its plain address,
// any other's fetched with the token and shown from an object URL.

const URL_PATH = '/prisoner/photo?prisoner=3&v=abc'

function Photo({ url, staffOnly }: { url: string | null; staffOnly: boolean }) {
  const { src, failed } = usePhotoSrc(url, staffOnly)
  if (failed) return <p>failed</p>
  return src ? <img src={src} alt="photo" /> : <p>loading</p>
}

const photoRequests = () => fakeApi.calls.filter((c) => c.path === URL_PATH)

afterEach(() => vi.restoreAllMocks())

describe('usePhotoSrc', () => {
  it('uses the plain address for a published record, fetching nothing', () => {
    renderApp(<Photo url={URL_PATH} staffOnly={false} />, { session: { role: 'admin' } })
    expect(screen.getByRole('img').getAttribute('src')).toBe(apiUrl(URL_PATH))
    expect(photoRequests()).toHaveLength(0)
  })

  it('fetches a staff-only photo with the token, shows it from an object URL, and lets it go on leaving', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo-1')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    fakeApi.on('GET', URL_PATH, new FakeResponse(200, new Blob(['png'], { type: 'image/png' })))
    const view = renderApp(<Photo url={URL_PATH} staffOnly />, { session: { role: 'admin' } })
    expect(screen.getByText('loading')).toBeTruthy()
    expect((await screen.findByRole('img')).getAttribute('src')).toBe('blob:photo-1')
    expect(photoRequests()[0].authorization).toBe(`Bearer ${TEST_TOKEN}`)
    expect(create).toHaveBeenCalledOnce()
    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:photo-1')
  })

  it('says so when the photo could not be fetched', async () => {
    renderApp(<Photo url={URL_PATH} staffOnly />, { session: { role: 'admin' } })
    await waitFor(() => expect(screen.getByText('failed')).toBeTruthy())
  })
})
