import { useState } from 'react'
import { checkPenName } from '../../api/auth'
import { MIN_PASSWORD_LENGTH, passwordStrength } from '../../utils/password'
import type { AccountValues } from './accountValues'

// Username, pen name, password and confirmation, shared by Join and Claim.
// Markup and classes from claim.html (pages/claim.css); the strength meter is
// the prototype's with the agreed 10-character minimum. Values and the
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
  const [show, setShow] = useState({ password: false, confirm: false })
  const set = (patch: Partial<AccountValues>) => onChange({ ...values, ...patch })

  const strength = passwordStrength(values.password)
  const mismatch = values.confirm.length > 0 && values.confirm !== values.password

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

      <div className="claim-field">
        <label className="claim-label" htmlFor={`${idPrefix}Password`}>
          Password
        </label>
        <div className="claim-pw-wrap">
          <input
            className="claim-input"
            type={show.password ? 'text' : 'password'}
            id={`${idPrefix}Password`}
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => set({ password: e.target.value })}
          />
          <button type="button" className="claim-show-pw" onClick={() => setShow((s) => ({ ...s, password: !s.password }))}>
            {show.password ? 'Hide' : 'Show'}
          </button>
        </div>
        <div className="pw-strength-bar">
          <div className={strength ? `pw-strength-fill ${strength.level}` : 'pw-strength-fill'}></div>
        </div>
        <span className="pw-strength-label">{strength?.label ?? `At least ${MIN_PASSWORD_LENGTH} characters.`}</span>
      </div>

      <div className="claim-field">
        <label className="claim-label" htmlFor={`${idPrefix}Confirm`}>
          Confirm password
        </label>
        <div className="claim-pw-wrap">
          <input
            className={mismatch ? 'claim-input error' : 'claim-input'}
            type={show.confirm ? 'text' : 'password'}
            id={`${idPrefix}Confirm`}
            autoComplete="new-password"
            value={values.confirm}
            onChange={(e) => set({ confirm: e.target.value })}
          />
          <button type="button" className="claim-show-pw" onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}>
            {show.confirm ? 'Hide' : 'Show'}
          </button>
        </div>
        <span className={mismatch ? 'claim-error is-visible' : 'claim-error'}>Passwords do not match.</span>
      </div>
    </>
  )
}
