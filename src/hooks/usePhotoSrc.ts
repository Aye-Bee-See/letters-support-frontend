import { useEffect, useState } from 'react'
import { apiUrl } from '../api/client'
import { getPrisonerPhotoBlob } from '../api/prisoners'

/**
 * Where an <img> finds a prisoner's photo (README "Photos"). A published
 * record's photo is public: its plain address on the API. Any other record's
 * is staff only, and an <img> request carries no token, so the API answers it
 * with a 404: with `staffOnly`, the picture is fetched through the API client
 * (which sends the token) and shown from an object URL, let go when the photo
 * changes or the page goes. `src` is null until it arrives; `failed` when it
 * didn't.
 */
export function usePhotoSrc(url: string | null, staffOnly: boolean): { src: string | null; failed: boolean } {
  const [fetched, setFetched] = useState<{ url: string; src: string | null } | null>(null)

  useEffect(() => {
    if (!url || !staffOnly) return
    let live = true
    let objectUrl: string | null = null
    getPrisonerPhotoBlob(url)
      .then((blob) => {
        if (!live) return
        objectUrl = URL.createObjectURL(blob)
        setFetched({ url, src: objectUrl })
      })
      .catch(() => {
        if (live) setFetched({ url, src: null })
      })
    return () => {
      live = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, staffOnly])

  if (!url) return { src: null, failed: false }
  if (!staffOnly) return { src: apiUrl(url), failed: false }
  const mine = fetched?.url === url ? fetched : null
  return { src: mine?.src ?? null, failed: mine !== null && mine.src === null }
}
