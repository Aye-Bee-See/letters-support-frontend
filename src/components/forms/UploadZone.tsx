import { useRef, useState } from 'react'

// The compact upload zone from new-letter.html (`upload-compact`, pages/new-letter.css)
// and its twin in thread.html's reply panel (`reply-upload`, pages/thread.css).
// Click or drop one PDF, JPG or PNG; the file stays in memory until sent.

const CLASSES = {
  compact: {
    wrap: 'upload-compact-wrap', zone: 'upload-compact', icon: 'upload-compact-icon', label: 'upload-compact-label', hint: 'upload-compact-hint',
    attached: 'upload-attached', attachedName: 'upload-attached-name', remove: 'upload-attached-remove',
  },
  reply: {
    wrap: 'reply-upload-wrap', zone: 'reply-upload-zone', icon: 'reply-upload-icon', label: 'reply-upload-label', hint: 'reply-upload-hint',
    attached: 'reply-upload-attached', attachedName: 'reply-upload-attached-name', remove: 'reply-upload-attached-remove',
  },
}

export default function UploadZone({
  variant,
  file,
  onFile,
  label,
  accept = '.pdf,.jpg,.jpeg,.png',
  hint = 'PDF, JPG, or PNG · max 20 MB',
}: {
  variant: 'compact' | 'reply'
  file: File | null
  onFile: (file: File | null) => void
  label: string
  accept?: string
  hint?: string
}) {
  const c = CLASSES[variant]
  const input = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  return (
    <div className={c.wrap}>
      {!file && (
        <div
          className={dragOver ? `${c.zone} drag-over` : c.zone}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          aria-label={`${label}: ${hint}`}
          onKeyDown={(e) => {
            // A button answers Space as well as Enter; Space would otherwise scroll the page.
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              input.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const dropped = e.dataTransfer.files[0]
            if (dropped) onFile(dropped)
          }}
        >
          <span className={c.icon}>⬆</span>
          <span className={c.label}>{label}</span>
          <span className={c.hint}>{hint}</span>
          <input
            ref={input}
            type="file"
            accept={accept}
            className="upload-file-input"
            onChange={(e) => {
              onFile(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </div>
      )}
      {/* The reply panel's attached row is hidden (thread.css) until a file is chosen: is-visible shows it. */}
      {file && (
        <div className={variant === 'reply' ? `${c.attached} is-visible` : c.attached}>
          {variant === 'compact' ? <span className="upload-attached-icon">📎</span> : <span>📎</span>}
          <span className={c.attachedName}>{file.name}</span>
          <button type="button" className={c.remove} onClick={() => onFile(null)} aria-label="Remove file">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
