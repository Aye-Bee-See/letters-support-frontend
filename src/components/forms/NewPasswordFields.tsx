import { useState } from 'react'
import { MIN_PASSWORD_LENGTH, passwordStrength } from '../../utils/password'

// A new password with the strength meter, and its confirmation. Used by
// AccountFields (Join, Claim) and by recovery. Markup and classes from
// claim.html (pages/claim.css).
export default function NewPasswordFields({
  password,
  confirm,
  onChange,
  idPrefix,
  label = 'Password',
}: {
  password: string
  confirm: string
  onChange: (next: { password: string; confirm: string }) => void
  idPrefix: string
  label?: string
}) {
  const [show, setShow] = useState({ password: false, confirm: false })
  const strength = passwordStrength(password)
  const mismatch = confirm.length > 0 && confirm !== password

  return (
    <>
      <div className="claim-field">
        <label className="claim-label" htmlFor={`${idPrefix}Password`}>
          {label}
        </label>
        <div className="claim-pw-wrap">
          <input
            className="claim-input"
            type={show.password ? 'text' : 'password'}
            id={`${idPrefix}Password`}
            autoComplete="new-password"
            value={password}
            onChange={(e) => onChange({ password: e.target.value, confirm })}
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
          Confirm {label.toLowerCase()}
        </label>
        <div className="claim-pw-wrap">
          <input
            className={mismatch ? 'claim-input error' : 'claim-input'}
            type={show.confirm ? 'text' : 'password'}
            id={`${idPrefix}Confirm`}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => onChange({ password, confirm: e.target.value })}
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
