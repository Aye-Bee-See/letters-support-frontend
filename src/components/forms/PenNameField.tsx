import { useState } from 'react'
import { checkPenName } from '../../api/auth'
import { samePenName } from '../../utils/penName'

// The pen name field, checked with the API when it loses focus. Used by
// AccountFields (Join, Claim, accepting an invitation) and the pen-name prompt.
// Markup and classes from claim.html (pages/claim.css).

export default function PenNameField({
  value,
  refused,
  onChange,
  idPrefix,
  hint,
  ownName,
}: {
  value: string
  /** The API said this name is not available. */
  refused: boolean
  onChange: (penName: string, refused: boolean) => void
  idPrefix: string
  hint: string
  /**
   * A name already this account's (on Claim, the one the group gave). Not checked:
   * the public check can't tell it's theirs, and would call it taken.
   */
  ownName?: string | null
}) {
  const [note, setNote] = useState<string | null>(null)

  async function check() {
    const name = value.trim()
    if (name.length < 3 || (ownName && samePenName(name, ownName))) return setNote(null)
    try {
      const r = await checkPenName(name)
      if (!r.available) {
        setNote(r.reason ?? 'That pen name is not available.')
        onChange(value, true)
      } else {
        setNote(r.twoParts ? 'Available.' : 'Available. A two-part name, like “James Hollow”, reads as a name to a mail room.')
      }
    } catch {
      setNote(null) // the API checks again on submit
    }
  }

  return (
    <div className="claim-field">
      <label className="claim-label" htmlFor={`${idPrefix}PenName`}>
        Pen name
      </label>
      <input
        className={refused ? 'claim-input error' : 'claim-input'}
        type="text"
        id={`${idPrefix}PenName`}
        maxLength={40}
        placeholder="e.g. James Hollow"
        value={value}
        onChange={(e) => {
          setNote(null)
          onChange(e.target.value, false)
        }}
        onBlur={check}
      />
      <span className="pw-strength-label" style={refused ? { color: 'var(--alert)' } : undefined}>
        {note ?? hint}
      </span>
    </div>
  )
}
