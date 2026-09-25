import { useState } from 'react'
import { checkPenName } from '../../api/auth'
import type { AccountValues } from './accountValues'
import NewPasswordFields from './NewPasswordFields'

// Username, pen name, password and confirmation, shared by Join and Claim.
// Markup and classes from claim.html (pages/claim.css). Values and the
// readiness check are in accountValues.ts.

export default function AccountFields({
  values,
  onChange,
  idPrefix,
  penNameHint,
}: {
  values: AccountValues
  onChange: (next: AccountValues) => void
  idPrefix: string
  penNameHint: string
}) {
  const [penNote, setPenNote] = useState<string | null>(null)
  const set = (patch: Partial<AccountValues>) => onChange({ ...values, ...patch })

  async function checkPen() {
    const name = values.penName.trim()
    if (name.length < 3) return setPenNote(null)
    try {
      const r = await checkPenName(name)
      if (!r.available) {
        setPenNote(r.reason ?? 'That pen name is not available.')
        onChange({ ...values, penNameRefused: true })
      } else {
        setPenNote(r.twoParts ? 'Available.' : 'Available. A two-part name, like “James Hollow”, reads as a name to a mail room.')
      }
    } catch {
      setPenNote(null) // the API checks again on submit
    }
  }

  return (
    <>
      <div className="claim-field">
        <label className="claim-label" htmlFor={`${idPrefix}Username`}>
          Username
        </label>
        <input
          className="claim-input"
          type="text"
          id={`${idPrefix}Username`}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={16}
          placeholder="choose a username"
          value={values.username}
          onChange={(e) => set({ username: e.target.value })}
        />
        <span className="pw-strength-label">3 to 16 characters. You sign in with this; it is never printed.</span>
      </div>

      <div className="claim-field">
        <label className="claim-label" htmlFor={`${idPrefix}PenName`}>
          Pen name
        </label>
        <input
          className={values.penNameRefused ? 'claim-input error' : 'claim-input'}
          type="text"
          id={`${idPrefix}PenName`}
          maxLength={40}
          placeholder="e.g. James Hollow"
          value={values.penName}
          onChange={(e) => {
            setPenNote(null)
            set({ penName: e.target.value, penNameRefused: false })
          }}
          onBlur={checkPen}
        />
        <span className="pw-strength-label" style={values.penNameRefused ? { color: 'var(--alert)' } : undefined}>
          {penNote ?? penNameHint}
        </span>
      </div>


      <NewPasswordFields
        password={values.password}
        confirm={values.confirm}
        onChange={(next) => set(next)}
        idPrefix={idPrefix}
      />
    </>
  )
}
