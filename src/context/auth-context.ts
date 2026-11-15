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
  /**
   * The account's unlocked keypair. Memory only, never stored; gone on sign-out.
   * Null in a session restored after a reload (`locked`) until the password is
   * given again.
   */
  keypair: Keypair | null
  /** The group's unlocked keypair (group admins who hold the group key). Memory only. */
  groupKeypair: Keypair | null
  /**
   * Two-factor sign-in is required of this account and not set up yet. Until it
   * is, the API refuses everything but setting it up, so the app sends the person
   * to the security page. Lists why (superadmins, all_groups, group).
   */
  twoFactorSetupRequired: TwoFactorReason[] | null
  /**
   * The site has just opened and is still looking for a session to carry on
   * with: another tab's, or the sign-in this tab remembers (issue #76). Until
   * it knows, a page for signed-in people waits rather than sending the person
   * to sign in.
   */
  restoring: boolean
  /**
   * Signed in, with the keys not open: a session restored after a reload from
   * the remembered token, before the password has been given again. Pages that
   * need no key work; one that opens or seals a letter asks first
   * (components/layout/UnlockGate.tsx).
   */
  locked: boolean
  /** Call with the keys once the password has opened them (auth/unlock.ts). */
  unlocked: (keypair: Keypair, groupKeypair: Keypair | null) => void
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
  /**
   * The account's own key bundle changed under this session: a new recovery
   * code (`hasRecovery`), or a password change (the re-wrapped private key and
   * its new salt and parameters). Merged into `keys`; the keypair is unchanged.
   */
  keysChanged: (changes: Partial<Omit<KeyBundle, 'orgKey'>>) => void
  /**
   * The API issued this session a new token (a password change ends every
   * session and answers a fresh one for the account holder's own). Every request
   * from now on carries it; the old one is already refused.
   */
  tokenRefreshed: (token: string, expires: number) => void
  isAuthenticated: boolean
  isAdmin: boolean
  isChapter: boolean
  isWriter: boolean
  /** Start a session from a completed sign-in (src/auth/signIn.ts). */
  startSession: (signedIn: SignedIn) => void
  /** Forget the token and everything unlocked with it; `notice` is said on the sign-in page, for a session that ended without the person signing out. */
  endSession: (notice?: string) => void
  /** Why the last session ended, when the person didn't end it themselves; cleared by the next sign-in. */
  endedNotice: string | null
}

export const AuthContext = createContext<AuthState | null>(null)
