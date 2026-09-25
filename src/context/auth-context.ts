import { createContext } from 'react'
import type { SignedIn } from '../auth/signIn'
import type { Keypair } from '../crypto'
import type { KeyBundle, User } from '../types'

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
