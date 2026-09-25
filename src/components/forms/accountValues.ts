import { MIN_PASSWORD_LENGTH } from '../../utils/password'

// The values behind AccountFields (kept apart so that file exports only a component).

export interface AccountValues {
  username: string
  penName: string
  password: string
  confirm: string
  /** The API said this pen name is not available (checked when the field loses focus). */
  penNameRefused: boolean
}

export const emptyAccountValues: AccountValues = { username: '', penName: '', password: '', confirm: '', penNameRefused: false }

/** Whether the form can be sent. The API checks everything again. */
export function accountValuesReady(v: AccountValues, { penNameRequired }: { penNameRequired: boolean }): boolean {
  const pen = v.penName.trim()
  return (
    v.username.trim().length >= 3 &&
    (penNameRequired ? pen.length >= 3 : pen.length === 0 || pen.length >= 3) &&
    !v.penNameRefused &&
    v.password.length >= MIN_PASSWORD_LENGTH &&
    v.confirm === v.password
  )
}
