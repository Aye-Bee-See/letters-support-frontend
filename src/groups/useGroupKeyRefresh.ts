import { useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import type { Keypair } from '../crypto'
import { fetchGroupKey } from './keys'

/**
 * Read the account's group key again and put it into the session (AuthContext's
 * groupKeySet): after a 409 KeyVersionError, or when the feed says the key was
 * handed, removed or rotated (README "Group keys"). Resolves to the group
 * keypair now open, or null when this admin doesn't hold it.
 */
export function useGroupKeyRefresh(): () => Promise<Keypair | null> {
  const { keypair, groupKeySet } = useAuth()
  return useCallback(async () => {
    if (!keypair) return null
    const { orgKey, groupKeypair } = await fetchGroupKey(keypair)
    if (orgKey) groupKeySet(groupKeypair, orgKey)
    return groupKeypair
  }, [keypair, groupKeySet])
}
