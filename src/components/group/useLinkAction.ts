import { useState } from 'react'
import type { ApiError } from '../../types'
import { commonRefusal, otherRefusal } from '../../utils/refusals'

/**
 * What to say when a link change is refused, from the status, never the API's
 * sentence. A 403 is a group that isn't active (README "What each role can do":
 * a group admin links their own group, and only while it is active), worded
 * with the rest of the shared cases in utils/refusals.
 */
export function linkRefusal(err: ApiError): string {
  // README "PUT /prison/relay", "PUT /prisoner/support": unlinking what isn't linked, or an unknown id.
  if (err.status === 404) return 'That link, or the record it points at, isn’t there any more. Reload the page to see the current links.'
  return commonRefusal(err) ?? otherRefusal(err)
}

/**
 * Shared by the link panels and the admin page's two-factor switch: run one
 * change that applies at once, and say why it failed (the API's message unless
 * `describe` words it).
 */
export function useLinkAction(describe: (err: ApiError) => string = (err) => err.message) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(describe(err as ApiError))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}
