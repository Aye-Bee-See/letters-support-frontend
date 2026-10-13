import type { ApiState } from '../../hooks/useApi'
import { refusalText } from '../../utils/refusals'

// Loading and error lines for a useApi request. The prototype has no design for
// either, so these stay plain until one is decided.
export default function LoadState({ state, what }: { state: Omit<ApiState<unknown>, 'reloading'>; what: string }) {
  if (state.loading) return <p>Loading {what}…</p>
  // A missing or unpublished record is a 404 from the API: nothing to retry.
  if (state.error?.status === 404) return <p>This {what} is not in the directory.</p>
  if (state.error)
    return (
      <p>
        Couldn't load {what} ({refusalText(state.error)}).{' '}
        <button type="button" className="btn btn-sm" onClick={state.reload}>
          Try again
        </button>
      </p>
    )
  return null
}
