import type { ChapterService } from '../../types'
import { serviceLabel } from '../../utils/groups'

// .service-tag from style.css: one service a group offers.
export default function ServiceTag({ service }: { service: ChapterService }) {
  return <span className="service-tag">{serviceLabel(service)}</span>
}
