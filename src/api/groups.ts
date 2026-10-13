// The UI says "group"; the API says "chapter" (/chapter). Also here: a group's
// blocks, its history, and its key (README "Group keys"), which the API serves
// under /auth.
import { del, getList, getOne, post, put } from './client'
import { forgetWriters } from './writers'
import type {
  AccountStatus,
  Chapter,
  ChapterService,
  GroupBlock,
  HistoryEntry,
  ListParams,
  MemberKeyRoster,
  RecordStatus,
  RotationMaterial,
} from '../types'

export interface GroupListParams extends ListParams {
  country?: string
  service?: ChapterService
  /** `both` groups match either; `both` itself is not a filter value (a 400). */
  networkRole?: 'collecting' | 'relay'
  accountStatus?: AccountStatus
  /** Staff only: draft, pending or published. Ignored for everyone else. */
  recordStatus?: RecordStatus
}

export const getGroups = (params?: GroupListParams) =>
  getList<Chapter>('/chapter/chapters', params)

/** full=true adds supported_prisoners and relay_prisons. */
export const getGroup = (id: number, full = true) =>
  getOne<Chapter>('/chapter/chapter', { id, full })

/**
 * A few groups by id, without their embeds, for naming them: one request each
 * (the list has no id filter). One that can't be read (not published, deleted)
 * is left out rather than failing the rest.
 */
export async function getGroupsByIds(ids: Iterable<number>): Promise<Map<number, Chapter>> {
  const unique = [...new Set(ids)]
  const found = await Promise.all(unique.map((id) => getGroup(id, false).catch(() => null)))
  return new Map(found.filter((g): g is Chapter => g !== null).map((g) => [g.id, g]))
}

/** The fields PUT /chapter/chapter accepts (CHAPTER_FIELDS in the API). lettersSent and averageTimeDays are counted, not set. */
export type GroupFields = Partial<
  Pick<
    Chapter,
    | 'name' | 'location' | 'subregion' | 'country' | 'about' | 'website' | 'email' | 'socialLinks' | 'services'
    | 'announcement' | 'networkRole' | 'accountStatus' | 'vouchedBy' | 'lettersSentBefore' | 'recordStatus'
  >
>

/**
 * Change a group's record: a superadmin any group's, a group admin their own
 * active group's (README "What each role can do"). Send just the fields that
 * changed. accountStatus is superadmin-only (a 403 for a group admin).
 * Approving a group that joined by invitation is
 * { accountStatus: 'active', recordStatus: 'published' }. Group keys can't be
 * set here (they have their own endpoints under /auth, below).
 */
export const updateGroup = (id: number, fields: GroupFields) => put<{ updatedRows: number }>('/chapter/chapter', { id, ...fields })

/**
 * Superadmin: delete a group. Never refused, and far-reaching: members and
 * managed writers lose their group, letters lose their relay group, and its
 * invite codes, invitations and member keys go with it. Suspending is usually what's wanted.
 */
export const deleteGroup = (id: number) => del<number>('/chapter/chapter', { id })

// --- Blocking a writer (README "Blocking a writer") -----------------------------

/** GET /chapter/blocks: the group's blocks, newest first. A superadmin names the group. */
export const getGroupBlocks = (chapter?: number) =>
  getOne<GroupBlock[]>('/chapter/blocks', chapter !== undefined ? { chapter } : undefined)

/**
 * POST /chapter/block: stop a writer (role `user`) sending letters through the
 * caller's own group. `reason` is required, at most 500 characters, and the
 * writer is told it. Blocking again replaces the reason. `held`: how many of
 * their letters waiting in the queue are held now (`writer_blocked`). Any group
 * admin of an active group; a superadmin gets a 403 (they ban instead).
 */
export const blockWriter = (user: number, reason: string) =>
  post<{ chapter: number; user: number; reason: string; held: number }>('/chapter/block', { user, reason })

/** DELETE /chapter/block: lift it. `released`: the held letters back in the queue. A 404 when there is no such block. */
export const unblockWriter = (user: number, chapter?: number) =>
  del<{ chapter: number; user: number; released: number }>('/chapter/block', { user, ...(chapter !== undefined ? { chapter } : {}) })

// --- History (README "The history of one record") -------------------------------

/**
 * GET /chapter/history?id=: what happened to the group's record, newest first,
 * paged. Its own admins (of an active group) also see who holds the key, who
 * owns it, its invite codes and blocks; another group sees directory edits only.
 */
export const getGroupHistory = (id: number, params?: Pick<ListParams, 'page' | 'page_size'>) =>
  getList<HistoryEntry>('/chapter/history', { id, ...params })

// --- Group keys (README "Group keys", "Rotating a group key") -------------------
// The API puts these under /auth. Every one needs an active group; the wrapped
// keys are made in the browser (src/crypto) and the server never sees the group
// private key.

/** What PUT /auth/keys and PUT /auth/chapter-keys say the server sealed to the new reader ("Latecomers"); null once it holds no keys. */
export type CaughtUp = { letters: number; sealed: number; dropped: number } | null

/** GET /auth/member-keys?chapter=: the owner, who holds the key, who is waiting for it. */
export const getMemberKeys = (chapter: number) => getOne<MemberKeyRoster>('/auth/member-keys', { chapter })

/**
 * PUT /auth/chapter-keys: give a group with no key its first keypair. The
 * caller, a group admin of that group with keys of their own, sends the new
 * group public key and the group private key sealed to their own public key, and
 * becomes the group-owner admin if the group has none. A superadmin cannot.
 * 409 KeyChangeError if the group already has a key, or the caller has no keys.
 */
export const setChapterKeys = (chapter: number, publicKey: string, wrappedOrgPrivateKey: string) =>
  put<{ chapter: number; publicKey: string; keyVersion: number; member: number; caughtUp: CaughtUp; owner: number }>(
    '/auth/chapter-keys',
    { chapter, publicKey, wrappedOrgPrivateKey },
  )

/**
 * PUT /auth/member-key: the group-owner admin hands the group key to another
 * group admin, sealed to that admin's public key. `keyVersion` is the version
 * of the group key that was sealed: a key rotated away meanwhile is a 409
 * KeyVersionError instead of being stored.
 */
export const handMemberKey = (chapter: number, user: number, wrappedOrgPrivateKey: string, keyVersion: number) =>
  put<{ chapter: number; member: number }>('/auth/member-key', { chapter, user, wrappedOrgPrivateKey, keyVersion })

/**
 * DELETE /auth/member-key: the owner stops handing the key to a group admin. It
 * cannot take back a key they already opened (rotation does that), and the last
 * holder cannot be removed (409 KeyChangeError). A 404 if they held none.
 */
export const removeMemberKey = (chapter: number, user: number) => del<number>('/auth/member-key', { chapter, user })

/**
 * PUT /auth/chapter-owner: make another group admin of the group its owner.
 * Once the group has a key, only to one who holds it: otherwise 409 OwnerError,
 * condition `no_key` (`owner.no_key`): hand them the key first.
 */
export const passOwnership = (chapter: number, user: number) =>
  put<{ chapter: number; owner: number; previous: number | null; holdsGroupKey: boolean }>('/auth/chapter-owner', { chapter, user })

/**
 * GET /auth/chapter-rotation?chapter=: everything a rotation must re-seal. Only
 * the group-owner admin, and only while they hold the group key.
 */
export const getRotation = (chapter: number) => getOne<RotationMaterial>('/auth/chapter-rotation', { chapter })

export interface RotationInput {
  chapter: number
  /** The current version, from getRotation: a 409 KeyVersionError if someone rotated first. */
  keyVersion: number
  /** The new group public key. */
  publicKey: string
  /** Every envelope from getRotation, re-sealed to the new key. */
  envelopes: { id: number; wrappedKey: string }[]
  /** Every writer from getRotation, their private key re-sealed to the new key. */
  writers: { id: number; orgWrappedPrivateKey: string }[]
  /** The group admins who keep access: the new group private key sealed to each. Anyone left out loses it. */
  members: { user: number; wrappedOrgPrivateKey: string }[]
}

/**
 * POST /auth/chapter-rotation: replace the group's keypair, all at once or not
 * at all. A 409 KeyVersionError or RotationIncompleteError (a letter arrived, or
 * a writer claimed their account, since getRotation) means start again.
 */
export const postRotation = (input: RotationInput) =>
  // Every writer's key is sealed anew: a kept writer list holds the old ones.
  post<{ chapter: number; publicKey: string; keyVersion: number; envelopes: number; writers: number; members: number[]; removed: number[] }>(
    '/auth/chapter-rotation',
    input,
  ).finally(forgetWriters)
