// Data model types for the letters.support API (sqlite-express-api).
// Source of truth: sqlite-express-api/database/schemas/*.schema.js and the
// README's field tables. Field names are the API's (camelCase, with a few
// snake_case embeds such as prison_details). Dates arrive as ISO-8601 strings.

// ---------------------------------------------------------------------------
// Value lists
// ---------------------------------------------------------------------------

/** API role strings. On screen: admin = superadmin, chapter = group admin, user = writer. */
export type UserRole = 'admin' | 'user' | 'chapter' | 'banned'
export type AuthScheme = 'plain' | 'split'

export type RecordStatus = 'draft' | 'pending' | 'published'
export type PrisonerStatus = 'pretrial' | 'incarcerated' | 'free'
export type RoutingMethod = 'direct' | 'scan_only' | 'direct_and_scan' | 'relay_only'

export type ChapterService =
  | 'letter_collection'
  | 'letter_writing_nights'
  | 'domestic_mailing'
  | 'international_mailing'
  | 'international_relay'
  | 'translation_assistance'
  | 'legal_support'
  | 'book_programs'
export type NetworkRole = 'collecting' | 'relay' | 'both'
export type AccountStatus = 'pending' | 'active' | 'suspended'
export type SocialLinkKey = 'instagram' | 'mastodon' | 'bluesky' | 'x' | 'youtube'

export type MailRuleCategory =
  | 'addressing'
  | 'paper_and_ink'
  | 'content'
  | 'photos'
  | 'enclosures'
  | 'publications'
  | 'senders'
  | 'handling'

export type Sender = 'user' | 'prisoner'
/** queued -> printed -> mailed for letters; received for replies; returned when it comes back. */
export type LetterStatus = 'queued' | 'printed' | 'mailed' | 'received' | 'returned' | 'declined'
/** Why a group declined to mail a letter (API #170). */
export type DeclineReason = 'facility_rule' | 'content' | 'other'
export type ReturnReason =
  | 'refused'
  | 'rule_violation'
  | 'transferred'
  | 'released'
  | 'bad_address'
  | 'unknown'
export type BanRecommendationStatus = 'pending' | 'banned' | 'dismissed'

/** A group admin's recommendation that a writer be banned site-wide (API #172), as GET /moderation/ban-recommendations answers it. */
export interface BanRecommendation extends Timestamps {
  id: number
  userId: number
  chapterId: number | null
  recommendedBy: number | null
  /** For superadmins only: the writer is never told of a recommendation. */
  reason: string
  status: BanRecommendationStatus
  decidedBy: number | null
  decidedAt: string | null
  /** Sent back to the recommending group with the decision. */
  decisionNote: string | null
  writer: { id: number; username: string; penName: string | null; name: string | null; role: UserRole } | null
  chapter_details: { id: number; name: string } | null
  recommended_by: { id: number; username: string; name: string | null } | null
  decided_by: { id: number; username: string; name: string | null } | null
}

/** GET /auth/blocks: a group that isn't mailing this writer's letters, and the reason it gave them (API #179). */
export interface WriterBlock {
  chapter: { id: number; name: string | null }
  reason: string
  blockedAt: string
}

/** Why a queued letter is held. `writer_blocked`: the group that would mail it blocked its writer (API #171). */
export type HeldReason = 'prisoner_free' | 'choose_relay' | 'reseal_needed' | 'writer_blocked'
export type ReaderType = 'server' | 'user' | 'chapter'

export type SubmissionResource = 'prisoner' | 'prison' | 'chapter'
export type SubmissionKind = 'create' | 'update'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export type InvitationKind = 'group' | 'member'
export type InvitationStatus = 'pending' | 'accepted' | 'revoked'

export type NotificationEvent =
  | 'letter.reply'
  | 'letter.status'
  | 'letter.queued'
  | 'submission.decided'
  | 'prisoner.moved'
  | 'prisoner.status'
  | 'group.key'
  | 'group.owner'
  | 'group.waiting'

/** Every record carries these. */
export interface Timestamps {
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Crypto material (opaque base64 strings to everything outside src/crypto)
// ---------------------------------------------------------------------------

/** Agreed 22 Sept: {"kdf":"argon2id","alg":2,"opslimit":2,"memlimit":67108864} */
export interface KdfParams {
  kdf: string
  alg?: number
  opslimit?: number
  memlimit?: number
}

/** GET /auth/keys, and `keys` in the login response. */
export interface KeyBundle {
  publicKey: string | null
  wrappedPrivateKey: string | null
  kdfSalt: string | null
  kdfParams: KdfParams | null
  hasRecovery: boolean
  /** Group admins only. The group's key fields are null until the group has a key / the member is handed it. */
  orgKey?: {
    chapterId: number
    chapterName: string
    chapterPublicKey: string | null
    /** The group's private key sealed to this member; null until the owner hands it over. */
    wrappedOrgPrivateKey: string | null
    keyVersion: number
    owner: number | null
    isOwner: boolean
  } | null
}

/** A letter's content key sealed to one reader. */
export interface Envelope {
  readerType: ReaderType
  readerId: number | null
  wrappedKey: string
  keyVersion?: number | null
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface User extends Timestamps {
  id: number
  username: string
  email: string
  name: string | null
  penName: string | null
  bio: string | null
  role: UserRole
  authScheme?: AuthScheme
  chapterId: number | null
  /** Group holding this account in custody (managed writer); null once claimed. */
  managedBy: number | null
  claimedAt: string | null
  claimedFrom: number | null
  anonymousForChapter: number | null
  sponsoredBy?: number | null
  /** Only returned to admins and the managing group. */
  managerNote?: string | null
  retentionDays: number | null
  publicKey: string | null
}

export interface MailRule {
  id: number
  tag: string
  category: MailRuleCategory
  label: string
  description: string | null
  retired?: boolean
}

/** GET /prison/mail-rules */
export interface MailRuleList {
  categories: MailRuleCategory[]
  rules: MailRule[]
  conflicts: [string, string][]
  parameters: Record<string, { type: string; label: string; description: string; minimum?: number; items?: string }>
}

/** A facility's postal address. */
export interface PrisonAddress {
  street?: string
  city?: string
  postalCode?: string
  /** The exact lines to print on an envelope, in order (1 to 8). Print these as given when present. */
  lines?: string[]
  [part: string]: string | string[] | undefined
}

/** GET /prisoner/filters and /prison/filters: the values present, with counts, most common first. */
export type FilterValues<K extends string> = Record<K, { value: string; count: number }[]>

/** A correctional facility. The UI calls it a "facility"; the API calls it a "prison". */
export interface Prison extends Timestamps {
  id: number
  prisonName: string
  address: PrisonAddress
  country: string | null
  routing: RoutingMethod | null
  scanService: string | null
  /** Rule tags, in master-list order. */
  mailRules: string[]
  mail_rule_details?: MailRule[]
  pageLimit: number | null
  photoLimit: number | null
  mailLanguages: string[] | null
  notes: string | null
  verifiedBy: number | null
  verifiedAt: string | null
  /** Staff only. */
  verificationNotes?: string | null
  recordStatus?: RecordStatus
  /** full=true */
  prisoners?: Prisoner[]
  relay_groups?: Chapter[]
}

/** The small prison summary embedded in prisoner and chat rows. */
export type PrisonSummary = Pick<Prison, 'id' | 'prisonName' | 'country'> & Partial<Pick<Prison, 'routing'>>

export interface Prisoner extends Timestamps {
  id: number
  birthName: string | null
  chosenName: string | null
  aliases: string[] | null
  prison: number | null
  country: string | null
  inmateID: string | null
  releaseDate: string | null
  detainedSince: string | null
  sentence: string | null
  charges: string | null
  estimatedRelease: string | null
  bio: string | null
  interests: string[] | null
  photoUrl: string | null
  supportWebsite: string | null
  donationInfo: string | null
  status: PrisonerStatus | null
  statusNotice: string | null
  featured: boolean
  verifiedBy: number | null
  verifiedAt: string | null
  /** Staff only. */
  verificationNotes?: string | null
  recordStatus?: RecordStatus
  /** A summary without full=true, the whole prison with it. */
  prison_details?: PrisonSummary | Prison | null
  /** full=true: each carries PrisonerSupport.description. */
  support_groups?: (Chapter & { PrisonerSupport?: { description: string | null } })[]
}

/** A support group. The UI calls it a "group"; the API calls it a "chapter". */
export interface Chapter extends Timestamps {
  id: number
  name: string
  location: Record<string, string>
  subregion: string | null
  country: string | null
  about: string | null
  website: string | null
  email: string | null
  socialLinks: Partial<Record<SocialLinkKey, string>> | null
  services: ChapterService[] | null
  announcement: string | null
  publicKey?: string | null
  keyVersion?: number
  keyRotatedAt?: string | null
  networkRole: NetworkRole
  accountStatus: AccountStatus
  vouchedBy: number | null
  /** The group-owner admin. */
  ownerId: number | null
  /** Counted by the server; null until 20 letters. */
  lettersSent: string | null
  averageTimeDays: number | null
  /** Staff only. */
  lettersSentBefore?: number
  lettersCounted?: number
  recordStatus?: RecordStatus
  /** full=true */
  supported_prisoners?: (Prisoner & { PrisonerSupport?: { description: string | null } })[]
  relay_prisons?: Prison[]
}

/** A thread between one writer and one prisoner. */
export interface Chat extends Timestamps {
  id: number
  user: number
  prisoner: number
  lastMessageAt: string | null
  last_message: Pick<Message, 'id' | 'sender' | 'status' | 'heldReason' | 'createdAt'> & {
    messageText?: string
    ciphertext?: string
    nonce?: string
  } | null
  heldCount: number
  heldReasons: HeldReason[]
  prisoner_details?: (Pick<Prisoner, 'id' | 'birthName' | 'chosenName' | 'status' | 'prison'> & {
    prison_details?: PrisonSummary | null
  }) | Prisoner | null
  /** full=true */
  user_details?: Pick<
    User,
    'id' | 'name' | 'username' | 'bio' | 'role' | 'chapterId' | 'managedBy' | 'claimedAt' | 'anonymousForChapter' | 'publicKey'
  >
  messages?: Message[]
}

/** A letter or a reply. */
export interface Message extends Timestamps {
  id: number
  chat: number
  sender: Sender
  user: number
  prisoner: number
  status: LetterStatus
  // TODO: encrypt before sending. Plaintext exists only in server mode; e2e uses ciphertext + nonce + envelopes.
  messageText?: string
  ciphertext?: string | null
  nonce?: string | null
  envelopes?: Envelope[]
  relayChapter: number | null
  relay_group: { id: number; name: string } | null
  relayNote?: string | null
  relayNoteCiphertext?: string | null
  relayNoteNonce?: string | null
  statusChangedAt: string | null
  statusChangedBy: number | null
  paper: boolean
  /** Nine digits, printed in the footer as 4827-1935-6. Outgoing letters only. */
  replyReference: string | null
  repliesTo: number | null
  keep: boolean
  returnReason: ReturnReason | null
  returnNote: string | null
  /** Declined by its group (API #170): why, the facility rule for a facility_rule decline, and the group's note (never encrypted). */
  declineReason?: DeclineReason | null
  declineRule?: string | null
  declineNote?: string | null
  heldReason: HeldReason | null
  resendOf: number | null
  /** full=true, outgoing letters: what the printed footer says. */
  footer?: Record<string, unknown>
  attachments?: Attachment[]
  status_history?: MessageStatusEntry[]
  prisoner_details?: Prisoner
  user_details?: Pick<User, 'id' | 'name' | 'username' | 'managedBy' | 'anonymousForChapter'>
}

export interface MessageStatusEntry extends Timestamps {
  id: number
  message: number
  fromStatus: LetterStatus | null
  toStatus: LetterStatus
  changedBy: number | null
  reason: ReturnReason | null
  note: string | null
}

export interface Attachment extends Timestamps {
  id: number
  message: number
  storedName: string
  originalName: string | null
  mimeType: string
  size: number
  uploadedBy: number | null
  /** e2e: the file is ciphertext under the letter's content key. */
  nonce: string | null
}

/** A managed writer as GET /auth/writers lists them. */
export interface Writer extends User {
  /** Present while a claim token is live; the token itself is never listed. */
  claimToken: { expiresAt: string } | null
  orgWrappedPrivateKey?: string | null
}

export interface ClaimToken {
  id: number
  userId: number
  expiresAt: string
  usedAt: string | null
  createdBy: number | null
}

export interface InviteCode extends Timestamps {
  id: number
  chapterId: number
  batch: string
  /** e.g. "Letter night, 2 October". */
  label: string | null
  expiresAt: string
  usedAt: string | null
  cancelledAt: string | null
  createdBy: number | null
}

export interface Invitation extends Timestamps {
  id: number
  kind: InvitationKind
  chapterId: number | null
  inviteeName: string
  inviteeEmail: string | null
  note: string | null
  expiresAt: string
  status: InvitationStatus
  invitedBy: number | null
  acceptedAt: string | null
  acceptedUser: number | null
  createdChapter: number | null
  /** Worked out by the API: `status`, except a pending one past expiresAt is `expired`. */
  state?: 'pending' | 'expired' | 'accepted' | 'revoked'
  /** Only in the create and renew answers: the one time the token is ever shown. */
  token?: string
}

/** A proposed directory edit (moderation). */
export interface Submission extends Timestamps {
  id: number
  resource: SubmissionResource
  kind: SubmissionKind
  targetId: number | null
  payload: Record<string, unknown>
  evidence: string | null
  note: string | null
  status: SubmissionStatus
  submittedBy: number | null
  reviewedBy: number | null
  reviewedAt: string | null
  decisionNote: string | null
  appliedChanges: Record<string, unknown> | null
  /** GET /moderation/submission: the target's present values of the proposed fields. */
  current?: Record<string, unknown> | null
  submitter?: AccountBrief | null
  reviewer?: AccountBrief | null
}

/** Who did something, as embedded in submissions and audit entries. */
export interface AccountBrief {
  id: number
  username: string
  name: string | null
  role: UserRole
}

// ---------------------------------------------------------------------------
// Superadmin overview
// ---------------------------------------------------------------------------

type ByResource<T> = Record<SubmissionResource, T>

/** GET /moderation/summary (admin): the dashboard counts. */
export interface AdminSummary {
  pendingSubmissions: ByResource<number>
  pendingBanRecommendations: number
  records: ByResource<Record<RecordStatus, number>>
  groups: { pendingApproval: number; suspended: number }
  staleVerification: { prisoner: number; prison: number }
  addressInDoubt: { prisoner: number }
  backups: {
    /** BACKUP_PUBLIC_KEY is set. Without it no backups are made. */
    configured: boolean
    count: number
    newest: { name: string; at: string; bytes: number } | null
    ageHours: number | null
  }
}

interface ReadinessGroup {
  id: number
  name: string
  networkRole: NetworkRole
  relayFacilities: number
  members: number
  membersWithKeys: number
}

/** GET /auth/encryption-readiness (admin): who still has to set up keys. */
export interface EncryptionReadiness {
  mode: 'server' | 'e2e'
  /** Accounts that can sign in, by how they sign in. `plain` still sends its password. */
  authSchemes: { split: number; plain: number }
  serverKeyConfigured: boolean
  /** Every active group that relays mail has a group key. */
  ready: boolean
  blockers: string[]
  groups: {
    active: number
    withKey: number
    withoutKey: (ReadinessGroup & { blocksTheSwitch: boolean })[]
    membersWaitingForGroupKey: (ReadinessGroup & { holders: number })[]
    unclaimedWritersWithoutKeys: { id: number; name: string; writers: number }[]
  }
  writers: { total: number; withKeys: number; withoutKeys: number; withoutKeysWithLetters: number }
  letters: { serverHeld: number; waitingForWriters: number; waitingForGroups: number }
}

/** GET /moderation/audit (admin): one entry, newest first. */
export interface AuditEntry {
  id: number
  actor: number | null
  /** e.g. `submission.approve`, `prisoner.update`, `user.update`. */
  action: string
  resource: string
  targetId: number | null
  details: Record<string, unknown> | null
  createdAt: string
  actor_details: AccountBrief | null
}

export interface Notification extends Timestamps {
  id: number
  userId: number
  event: NotificationEvent
  chat: number | null
  message: number | null
  submission: number | null
  /** Small non-secret facts for wording, e.g. { status: "mailed" }. Never letter content. */
  detail: Record<string, unknown> | null
  readAt: string | null
}

/** An item from the ABCF.net news feed (front page). */
export interface AbcfFeedItem {
  title: string
  url: string
  date: string
  summary: string
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** GET /auth/login-params */
export interface LoginParams {
  scheme: AuthScheme
  kdfSalt: string
  kdfParams: KdfParams
}

/** POST /auth/login -> data */
/** Why two-factor sign-in is required of an account (GET /auth/two-factor, and sign-in). */
export type TwoFactorReason = 'superadmins' | 'all_groups' | 'group'

export interface LoginResult {
  user: User
  token: { token: string; expires: number }
  keys?: KeyBundle
  /** Required of this account and not set up yet: only set-up (and sign-out) works until it is. */
  twoFactor?: { setupRequired: true; because: TwoFactorReason[] }
}

/** POST /auth/login for an account with two-factor sign-in on: no session yet, only the second step. */
export interface TwoFactorChallenge {
  twoFactor: { challenge: string; expiresAt: string }
}

/** GET /auth/two-factor */
export interface TwoFactorStatus {
  enabled: boolean
  enabledAt: string | null
  /** A secret was handed out and not confirmed yet. */
  settingUp: boolean
  recoveryCodesLeft: number
  required: boolean
  requiredBecause: TwoFactorReason[]
}

/** GET /auth/two-factor/policy (superadmin) */
export interface TwoFactorPolicy {
  superadmins: boolean
  allGroups: boolean
  /** Groups that require it of their own admins. */
  groups: { id: number; name: string }[]
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

/** Every successful response. */
export interface ApiEnvelope<T> {
  data: T
  info: string | null
  success: true
  status: number
  name: string
}

/** List responses add paging fields beside data. */
export interface ApiListEnvelope<T> extends ApiEnvelope<T[]> {
  total: number
  page: number
  page_size: number
}

/** What list functions in src/api return. */
export interface ListResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** Paging and filters for list endpoints. Values are sent as query parameters. */
export interface ListParams {
  page?: number
  page_size?: number
  q?: string
  sort?: 'name' | 'newest' | 'oldest'
  full?: boolean
  [filter: string]: string | number | boolean | undefined
}

/** A failed request, normalised by src/api/client.ts. */
export interface ApiError {
  /** HTTP status; 0 when the server could not be reached. */
  status: number
  /** Error class name, e.g. NotFoundError, ClaimError. Stable. */
  name: string | null
  /** Machine-readable reason, e.g. expired, used. Stable; key UI behaviour on name + condition. */
  condition: string | null
  /** Validation messages (400). */
  errors: string[]
  /** Human-readable, English, not stable. Show it, never match on it. */
  message: string
  /** Seconds to wait, from Retry-After on a 429. */
  retryAfter?: number
}
