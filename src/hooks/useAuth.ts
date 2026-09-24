import { useContext } from 'react'
import { AuthContext, type AuthState } from '../context/auth-context'

export function useAuth(): AuthState {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
