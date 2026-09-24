import { createContext } from 'react'
import type { KeyBundle, LoginResult, User } from '../types'

// Kept apart from AuthContext.tsx so that file exports only a component
// (React Fast Refresh requirement).

export interface AuthState {
  user: User | null
  token: string | null
  /** Token expiry, Unix ms. */
  expires: number | null
  /** The account's key bundle as returned at sign-in. Unlocked keys join it in Step 3. */
  keys: KeyBundle | null
  isAuthenticated: boolean
  isAdmin: boolean
  isChapter: boolean
  isWriter: boolean
  /** Start a session from a successful POST /auth/login. */
  startSession: (result: LoginResult) => void
  /** Forget the token and everything unlocked with it. */
  endSession: () => void
}

export const AuthContext = createContext<AuthState | null>(null)
