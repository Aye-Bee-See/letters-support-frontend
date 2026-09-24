import type { AbcfFeedItem } from '../types'

// TODO: wire to real endpoint. The API has no ABCF.net feed proxy yet; ask Pax.
// Items are taken from the prototype (solidarity-site/index.html).
const MOCK_FEED: AbcfFeedItem[] = [
  {
    title: 'Political Prisoner Update: Kevin "Rashid" Johnson Transferred Again',
    url: 'https://www.abcf.net/',
    date: '2026-07-28',
    summary: '',
  },
]

export const getAbcfFeed = async (): Promise<AbcfFeedItem[]> => MOCK_FEED
