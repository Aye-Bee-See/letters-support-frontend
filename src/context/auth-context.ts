import { createContext } from 'react'
import type { SignedIn } from '../auth/signIn'
import type { Keypair } from '../crypto'
import type { KeyBundle, TwoFactorReason, User } from '../types'

// Kept apart from AuthContext.tsx so that file exports only a component
// (React Fast Refresh requirement).

export interface AuthState {
  user: User | null
  token: string | null
  /** Token expiry, Unix ms. */
  expires: number | null
  /** The account's key bundle from sign-in (wrapped keys only; nothing unlocked). */
  keys: KeyBundle | null
  /** The account's unlocked keypair. Memory only; gone on sign-out or refresh. */
  keypair: Keypair | null
  /** The group's unlocked keypair (group admins who hold the group key). Memory only. */
  groupKeypair: Keypair | null
  /**
   * Two-factor sign-in is required of this account and not set up yet. Until it
   * is, the API refuses everything but setting it up, so the app sends the person
   * to the security page. Lists why (superadmins, all_groups, group).
   */
  twoFactorSetupRequired: TwoFactorReason[] | null
  /** Call once two-factor sign-in is switched on. */
  twoFactorSetUp: () => void
  /** Call once the account has chosen a pen name (the name as the API stored it). */
  penNameChosen: (penName: string) => void
  /**
   * The group key changed under this session (README "Group keys", "Rotating a
   * group key"): it was set up, handed to this admin, taken back, or rotated.
   * Replaces `keys.orgKey` and the open group keypair (null when this admin no
   * longer holds it), so the admin can act at once without signing in again.
   */
  groupKeySet: (groupKeypair: Keypair | null, orgKey: NonNullable<KeyBundle['orgKey']>) => void
  isAuthenticated: boolean
  isAdmin: boolean
  isChapter: boolean
  isWriter: boolean
  /** Start a session from a completed sign-in (src/auth/signIn.ts). */
  startSession: (signedIn: SignedIn) => void
  /** Forget the token and everything unlocked with it. */
  endSession: () => void
}

export const AuthContext = createContext<AuthState | null>(null)
