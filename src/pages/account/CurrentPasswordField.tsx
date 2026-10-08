import { useState } from 'react'

/** The account's current password, asked for before a change to its keys. Markup from claim.html's classes. */
export default function CurrentPasswordField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div className="claim-field">
      <label className="claim-label" htmlFor="currentPassword">
        Your current password
      </label>
      <div className="claim-pw-wrap">
        <input
          className="claim-input"
          type={show ? 'text' : 'password'}
          id="currentPassword"
          autoComplete="current-password"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="claim-show-pw" onClick={() => setShow((s) => !s)}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}
