import type { AccountValues } from './accountValues'
import NewPasswordFields from './NewPasswordFields'
import PenNameField from './PenNameField'

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
  const set = (patch: Partial<AccountValues>) => onChange({ ...values, ...patch })

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

      <PenNameField
        value={values.penName}
        refused={values.penNameRefused}
        onChange={(penName, penNameRefused) => set({ penName, penNameRefused })}
        idPrefix={idPrefix}
        hint={penNameHint}
      />

      <NewPasswordFields
        password={values.password}
        confirm={values.confirm}
        onChange={(next) => set(next)}
        idPrefix={idPrefix}
      />
    </>
  )
}
