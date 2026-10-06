// Shown when a letter was sent but its file didn't upload (src/letters/send.ts,
// AttachmentNotUploaded): the letter is on its way, so this isn't "Not sent";
// only the file is left. Used by New Letter, the reply panel, and recording a
// prisoner's reply (`what="reply"`: the reply was recorded, not sent).

export default function AttachmentRetry({
  fileName,
  error,
  busy,
  onRetry,
  onSkip,
  what = 'letter',
}: {
  fileName: string
  error: string
  busy: boolean
  onRetry: () => void
  onSkip: () => void
  what?: 'letter' | 'reply'
}) {
  const done = what === 'reply' ? 'The reply was recorded' : 'Your letter was sent'
  const once = what === 'reply' ? 'The reply won’t be recorded twice' : 'Your letter won’t be sent twice'
  return (
    <div className="attachment-retry" role="alert">
      <p>
        <strong>{done}, but the attachment “{fileName}” didn’t upload.</strong> {error}
      </p>
      <p>Try the attachment again, or go on without it. {once} either way.</p>
      <div className="attachment-retry-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onRetry}>
          {busy ? 'Uploading…' : 'Retry the attachment'}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={onSkip}>
          Continue without it
        </button>
      </div>
    </div>
  )
}
