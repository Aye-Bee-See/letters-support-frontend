import type { AbcfFeedItem } from '../types'

// TODO: wire to real endpoint. A cron job will pull ABCF.net and populate this
// server-side; until then the items are the prototype's (solidarity-site/index.html).
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

export const getAbcfFeed = async (): Promise<AbcfFeedItem[]> => MOCK_FEED
