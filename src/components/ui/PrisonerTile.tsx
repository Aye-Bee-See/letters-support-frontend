import { Link } from 'react-router-dom'
import type { Prisoner, PrisonSummary } from '../../types'
import { displayName, estimatedRelease, heldAt, otherNames, shortDate, yearOf } from '../../utils/prisoners'
import StatusNotice from './StatusNotice'
import TagCloud from './TagCloud'

interface Props {
  prisoner: Prisoner
  /** The front page shows the year detained ("Since: 2021"); the index the date ("Since: 14 Jul 2021"). */
  since?: 'year' | 'date'
  /** On a facility page the facility is known: no other-names or "Held at" lines (facility-profile.html). */
  compact?: boolean
}

// Markup and classes from the prisoner grids in solidarity-site/index.html,
// prisoners.html and facility-profile.html.
export default function PrisonerTile({ prisoner, since = 'year', compact = false }: Props) {
  const name = displayName(prisoner)
  const facility = heldAt(prisoner.prison_details as PrisonSummary | null | undefined)
  const detained = since === 'date' ? shortDate(prisoner.detainedSince) : yearOf(prisoner.detainedSince)

  return (
    <Link to={`/prisoners/${prisoner.id}`} className="prisoner-tile">
      {prisoner.photoUrl ? (
        <img className="prisoner-tile-img" src={prisoner.photoUrl} alt={name} loading="lazy" />
      ) : (
        <div className="prisoner-tile-img-placeholder">Photo</div>
      )}
      <div className="prisoner-tile-body">
        <StatusNotice text={prisoner.statusNotice} />
        <p className="prisoner-tile-name">{name}</p>
        {!compact && <p className="prisoner-tile-aliases">{otherNames(prisoner).join(', ')}</p>}
        <p className="prisoner-tile-meta">
          {!compact && (
            <>
              <strong>Held at:</strong> {facility ?? 'Contact support site for address'}
              <br />
            </>
          )}
          <strong>Since:</strong> {detained ?? 'Unknown'} &nbsp;·&nbsp;{' '}
          <strong>Est. release:</strong> {estimatedRelease(prisoner) ?? 'Unknown'}
        </p>
        <TagCloud tags={prisoner.interests} />
      </div>
    </Link>
  )
}
