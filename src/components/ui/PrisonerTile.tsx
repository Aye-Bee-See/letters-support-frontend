import { Link } from 'react-router-dom'
import type { Prisoner, PrisonSummary } from '../../types'
import { displayName, estimatedRelease, heldAt, otherNames, yearOf } from '../../utils/prisoners'
import StatusNotice from './StatusNotice'
import TagCloud from './TagCloud'

// Markup and classes from the prisoner grid in solidarity-site/index.html and prisoners.html.
export default function PrisonerTile({ prisoner }: { prisoner: Prisoner }) {
  const name = displayName(prisoner)
  const facility = heldAt(prisoner.prison_details as PrisonSummary | null | undefined)

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
        <p className="prisoner-tile-aliases">{otherNames(prisoner).join(', ')}</p>
        <p className="prisoner-tile-meta">
          <strong>Held at:</strong> {facility ?? 'Contact support site for address'}
          <br />
          <strong>Since:</strong> {yearOf(prisoner.detainedSince) ?? 'Unknown'} &nbsp;·&nbsp;{' '}
          <strong>Est. release:</strong> {estimatedRelease(prisoner) ?? 'Unknown'}
        </p>
        <TagCloud tags={prisoner.interests} />
      </div>
    </Link>
  )
}
