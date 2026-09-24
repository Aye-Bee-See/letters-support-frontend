import type { ChapterService } from '../../types'
import { SERVICE_LABELS } from '../../utils/groups'

// .service-tag from style.css: one service a group offers.
export default function ServiceTag({ service }: { service: ChapterService }) {
  return <span className="service-tag">{SERVICE_LABELS[service] ?? service}</span>
}
