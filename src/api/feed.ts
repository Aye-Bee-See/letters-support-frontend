import { getOne } from './client'
import type { AbcfFeedItem } from '../types'

/**
 * ABCF.net news, newest first. The API pulls the feed on a schedule and stores
 * it (GET /news), so visitors' browsers never contact abcf.net. The list is
 * empty until the first fetch after boot, or when the feature is turned off.
 * Any failure, a 404 included, reads as an empty list: the front page shows
 * no news rather than an error.
 */
export async function getAbcfFeed(limit = 3): Promise<AbcfFeedItem[]> {
  try {
    return await getOne<AbcfFeedItem[]>('/news', { limit })
  } catch {
    return []
  }
}
