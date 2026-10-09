import type { SignedIn } from '../auth/signIn'
import type { KeyBundle, TwoFactorReason, User, UserRole } from '../types'

// Sessions for tests, as src/auth/signIn.ts would hand them to AuthContext's
// startSession. The keys are placeholders: nothing here opens a letter.

export const TEST_TOKEN = 'test-session-token'

export function testUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: 'tester',
    email: 'tester@example.org',
    name: null,
    penName: 'Tess',
    bio: null,
    role: 'user',
    chapterId: null,
    managedBy: null,
    claimedAt: null,
    claimedFrom: null,
    anonymousForChapter: null,
    retentionDays: null,
    publicKey: 'public-key',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  } as User
}

export interface SessionSeed {
  role?: UserRole
  user?: Partial<User>
  /** The group key as sign-in found it: `none` (no group key yet), `not-held`, or `held` (open in the session). */
  groupKey?: 'none' | 'not-held' | 'held'
  /** Two-factor sign-in is required of this account and not set up. */
  twoFactorSetupRequired?: TwoFactorReason[]
}

/** A completed sign-in for `seed`, ready for startSession. */
export function signedInAs(seed: SessionSeed = {}): SignedIn {
  const role = seed.role ?? seed.user?.role ?? 'user'
  const user = testUser({ role, ...(role === 'chapter' ? { chapterId: 10, penName: null } : {}), ...seed.user })
  const groupKey = seed.groupKey ?? 'held'
  const bundle: KeyBundle = {
    publicKey: 'public-key',
    wrappedPrivateKey: 'wrapped',
    kdfSalt: 'salt',
    kdfParams: null,
    hasRecovery: true,
    orgKey:
      role === 'chapter' && user.chapterId !== null
        ? {
            chapterId: user.chapterId,
            chapterName: 'Test Group',
            chapterPublicKey: groupKey === 'none' ? null : 'group-public-key',
            wrappedOrgPrivateKey: groupKey === 'held' ? 'wrapped-group-key' : null,
            keyVersion: groupKey === 'none' ? 0 : 1,
            owner: user.id,
            isOwner: true,
          }
        : null,
  }
  return {
    result: {
      user,
      token: { token: TEST_TOKEN, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 },
      ...(seed.twoFactorSetupRequired ? { twoFactor: { setupRequired: true as const, because: seed.twoFactorSetupRequired } } : {}),
    },
    bundle,
    keypair: { publicKey: 'public-key', privateKey: 'private-key' },
    groupKeypair: role === 'chapter' && groupKey === 'held' ? { publicKey: 'group-public-key', privateKey: 'group-private-key' } : null,
  }
}
