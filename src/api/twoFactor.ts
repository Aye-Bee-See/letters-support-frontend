// Two-factor sign-in (README "Two-factor sign-in"): a six-digit code from an
// authenticator app (TOTP), with one-time recovery codes for a lost phone.
// Optional for everyone; a superadmin can require it of superadmins, of every
// group's admins, or of one group's.
import { del, getOne, post, put } from './client'
import type { LoginResult, TwoFactorPolicy, TwoFactorStatus } from '../types'

/** A code from the authenticator app, or (where allowed) one of the recovery codes. */
export type SecondFactor = { code: string } | { recoveryCode: string }

/** The second step of signing in, with the challenge from POST /auth/login. Answers what a one-step sign-in does. */
export const loginTwoFactor = (challenge: string, factor: SecondFactor) => post<LoginResult>('/auth/login/two-factor', { challenge, ...factor })

export const getTwoFactor = () => getOne<TwoFactorStatus>('/auth/two-factor')

/** A new secret for an authenticator app, and the otpauth link to show as a QR code. Nothing changes until confirmed. */
export const setupTwoFactor = () => post<{ secret: string; otpauthUri: string }>('/auth/two-factor/setup')

/** Switch it on with the first code from the app. Answers the recovery codes: the only time they are shown. */
export const confirmTwoFactor = (code: string) =>
  post<{ enabled: true; enabledAt: string; recoveryCodes: string[] }>('/auth/two-factor/confirm', { code })

/** A fresh set of recovery codes (the old ones stop working). Needs a code from the app. */
export const newRecoveryCodes = (code: string) => post<{ recoveryCodes: string[] }>('/auth/two-factor/recovery-codes', { code })

/** Switch it off. A session alone isn't enough: a code or a recovery code. Refused (409) while it is required. */
export const disableTwoFactor = (factor: SecondFactor) => del<{ enabled: false }>('/auth/two-factor', factor)

// Superadmin: who must use it.

export const getTwoFactorPolicy = () => getOne<TwoFactorPolicy>('/auth/two-factor/policy')

/** Require it of every superadmin and/or every group's admins. Requiring it of superadmins needs your own on first (409 own_first). */
export const setTwoFactorPolicy = (changes: Partial<Pick<TwoFactorPolicy, 'superadmins' | 'allGroups'>>) =>
  put<Pick<TwoFactorPolicy, 'superadmins' | 'allGroups'>>('/auth/two-factor/policy', changes)

/** Require it of one group's admins. */
export const setGroupTwoFactor = (chapter: number, required: boolean) =>
  put<{ chapter: number; required: boolean }>('/auth/two-factor/group', { chapter, required })

/** Superadmin: switch it off for someone who lost their phone and their recovery codes. They sign in with their password, and set it up again if it's required. A 409 if it isn't on. */
export const resetTwoFactor = (user: number) => del<{ user: number; enabled: false }>('/auth/two-factor/user', { user })
