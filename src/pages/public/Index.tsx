import { Link } from 'react-router-dom'
import { getAbcfFeed } from '../../api/feed'
import { getPrisoners } from '../../api/prisoners'
import LoadState from '../../components/ui/LoadState'
import PrisonerTile from '../../components/ui/PrisonerTile'
import { useApi } from '../../hooks/useApi'

const ABCF_URL = 'https://www.abcf.net/'
const TILE_COUNT = 6

/** Featured prisoners; until any are featured, the most recently added. */
async function getFrontPagePrisoners() {
  const featured = await getPrisoners({ featured: true, page_size: TILE_COUNT })
  if (featured.items.length) return { featured: true, prisoners: featured.items }
  const recent = await getPrisoners({ sort: 'newest', page_size: TILE_COUNT })
  return { featured: false, prisoners: recent.items }
}

const feedDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// Markup and classes from solidarity-site/index.html.
export default function Index() {
  const feed = useApi(getAbcfFeed, [])
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

            {feed.data?.map((item) => (
              <article key={item.title} className="feed-item">
                <time className="feed-date" dateTime={item.date}>
                  {feedDate(item.date)}
                </time>
                <h3 className="feed-item-title">
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                </h3>
                <p className="feed-item-excerpt">{item.summary}</p>
              </article>
            ))}

            <div className="feed-footer">
              <a href={ABCF_URL} target="_blank" rel="noopener noreferrer" className="feed-more">
                More at ABCF.net →
              </a>
              <span className="feed-note">Updated hourly</span>
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
