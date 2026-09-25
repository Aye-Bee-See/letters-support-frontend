import { getOne, toApiError } from './client'
import type { AbcfFeedItem } from '../types'

/**
 * ABCF.net news, newest first. The API pulls the feed on a schedule and stores
 * it (GET /news), so visitors' browsers never contact abcf.net. The list is
 * empty until the first fetch after boot, or when the feature is turned off.
 */
export async function getAbcfFeed(limit = 3): Promise<AbcfFeedItem[]> {
  try {
    return await getOne<AbcfFeedItem[]>('/news', { limit })
  } catch (err) {
    // TODO: remove once the API with GET /news (pull request #124) is merged.
    if (toApiError(err).status === 404) return MOCK_FEED
    throw err
  }
}

// The prototype's items (solidarity-site/index.html), shown only while the
// running API predates GET /news.
const MOCK_FEED: AbcfFeedItem[] = [
  {
    title: 'Political Prisoner Update: Kevin "Rashid" Johnson Transferred Again',
    url: 'https://www.abcf.net/',
    date: '2026-07-28',
    summary:
      'New Afrikan Black Panther Party minister Kevin "Rashid" Johnson has been transferred to yet another facility. Supporters are asked to hold mail until a confirmed address is available.',
  },
  {
    title: 'Call to Action: Support Jailhouse Lawyers Speak v. Lynch',
    url: 'https://www.abcf.net/',
    date: '2026-07-19',
    summary:
      'A federal appeals court will hear arguments in a landmark case brought by incarcerated legal advocates. The ABCF is coordinating a letter-writing campaign to the court clerk.',
  },
  {
    title: 'Fundraiser: Covering Medical Costs for Sundiata Acoli',
    url: 'https://www.abcf.net/',
    date: '2026-07-09',
    summary:
      'Sundiata Acoli, released in 2023 after more than 49 years of imprisonment, continues to face significant medical expenses. The ABCF is raising funds for ongoing care.',
  },
]
