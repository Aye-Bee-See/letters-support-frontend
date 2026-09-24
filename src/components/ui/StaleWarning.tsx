import { isStale } from '../../utils/facilities'

// .stale-warning from style.css: a record never verified, or not for 6+ months.
export default function StaleWarning({ verifiedAt }: { verifiedAt: string | null | undefined }) {
  if (!isStale(verifiedAt)) return null
  return <div className="stale-warning">{verifiedAt ? '⚠ 6+ months' : '⚠ Not verified'}</div>
}
