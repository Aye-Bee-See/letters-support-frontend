import { Link } from 'react-router-dom'
import { getAbcfFeed } from '../../api/feed'
import { getPrisoners } from '../../api/prisoners'
import LoadState from '../../components/ui/LoadState'
import PrisonerTile from '../../components/ui/PrisonerTile'
import { useApi } from '../../hooks/useApi'
import type { AbcfFeedItem } from '../../types'
import { utcDate } from '../../utils/dates'

const ABCF_URL = 'https://www.abcf.net/'
const TILE_COUNT = 6

/** Featured prisoners; until any are featured, the most recently added. */
async function getFrontPagePrisoners() {
  const featured = await getPrisoners({ featured: true, page_size: TILE_COUNT })
  if (featured.items.length) return { featured: true, prisoners: featured.items }
  const recent = await getPrisoners({ sort: 'newest', page_size: TILE_COUNT })
  return { featured: false, prisoners: recent.items }
}

/** The item's date in words, or null when the feed gave none or one that does not parse. */
const feedDate = (iso: string | null) => utcDate(iso)

/** A key per item: its URL, or URL and position when two items share one. */
function keysFor(items: AbcfFeedItem[]): string[] {
  const seen = new Set<string>()
  return items.map((item, i) => {
    const key = seen.has(item.url) ? `${item.url}#${i}` : item.url
    seen.add(item.url)
    return key
  })
}

// Markup and classes from solidarity-site/index.html.
export default function Index() {
  // No loading or error line for the feed: until the API has fetched it, it is empty and shows nothing.
  const feed = useApi(() => getAbcfFeed(3), [])
  const feedItems = feed.data ?? []
  const feedKeys = keysFor(feedItems)
  const tiles = useApi(getFrontPagePrisoners, [])

  return (
    <>
      {/* SPLASH + FEED */}
      <section className="splash">
        <div className="wrap splash-two-col">
          <div className="splash-inner">
            <p className="splash-eyebrow">Prisoner correspondence network</p>
            <h1 className="splash-headline">
              Letters matter.
              <br />
              Write one today.
            </h1>
            <p className="splash-body">
              letters.support connects letter writers with political prisoners around the world. Browse prisoner
              profiles, find a support group near you, and learn exactly what each facility requires before you
              write. Groups organizing letter writing nights can print ready-made info sheets directly from this site.
            </p>
            <div className="splash-actions">
              <Link to="/prisoners" className="btn btn-primary">
                Browse prisoners
              </Link>
              <Link to="/groups" className="btn">
                Find a group near you
              </Link>
            </div>
          </div>

          <aside className="feed-panel">
            <div className="feed-header">
              <span className="feed-label">News from</span>
              <a href={ABCF_URL} target="_blank" rel="noopener noreferrer" className="feed-source-link">
                ABCF.net
              </a>
            </div>

            {feedItems.map((item, i) => {
              const date = feedDate(item.date)
              return (
                <article key={feedKeys[i]} className="feed-item">
                  {date && item.date && (
                    <time className="feed-date" dateTime={item.date}>
                      {date}
                    </time>
                  )}
                  <h3 className="feed-item-title">
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      {item.title}
                    </a>
                  </h3>
                  <p className="feed-item-excerpt">{item.summary}</p>
                </article>
              )
            })}

            <div className="feed-footer">
              <a href={ABCF_URL} target="_blank" rel="noopener noreferrer" className="feed-more">
                More at ABCF.net →
              </a>
              {/* The API fetches every few hours (NEWS_EVERY_HOURS, 6 by default); the prototype said hourly. */}
              <span className="feed-note">Updated regularly</span>
            </div>
          </aside>
        </div>
      </section>

      {/* FEATURED PRISONERS */}
      <section className="section">
        <div className="wrap">
          <div className="section-header">
            <p className="section-label">{tiles.data && !tiles.data.featured ? 'Recently added' : 'Currently featured'}</p>
            <h2 className="section-heading">Prisoners seeking correspondence</h2>
            <div className="section-rule"></div>
          </div>

          <LoadState state={tiles} what="prisoners" />
          {tiles.data && (
            <div className="prisoner-grid">
              {tiles.data.prisoners.map((p) => (
                <PrisonerTile key={p.id} prisoner={p} />
              ))}
            </div>
          )}

          <div style={{ marginTop: '2rem' }}>
            <Link to="/prisoners" className="btn btn-primary">
              View all prisoners →
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
