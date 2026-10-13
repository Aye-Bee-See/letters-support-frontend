import { Link } from 'react-router-dom'
import { getMyBlocks } from '../../api/auth'
import { useApi } from '../../hooks/useApi'

/**
 * A line for the writer's inbox when at least one group isn't mailing their
 * letters, linking to /account/blocks (pages/account/Blocks.tsx). Nothing
 * otherwise, or if it can't load.
 */
export default function BlocksNotice() {
  const blocks = useApi(getMyBlocks, [])
  const list = blocks.data ?? []
  if (list.length === 0) return null
  return (
    <p className="sidebar-info" style={{ marginBottom: '1.25rem' }}>
      <strong>
        {list.length === 1 ? `${list[0].chapter.name ?? 'A group'} isn’t mailing your letters.` : `${list.length} groups aren’t mailing your letters.`}
      </strong>{' '}
      <Link to="/account/blocks">See why</Link>.
    </p>
  )
}
