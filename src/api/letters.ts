// Threads (/chat) and letters (/messaging).
import client, { del, getAllPages, getList, getOne, post, put } from './client'
import type {
  Attachment,
  Chat,
  DeclineReason,
  Envelope,
  LetterStatus,
  ListParams,
  Message,
  MissingEnvelope,
  ReferenceLookup,
  ReturnReason,
  WriterMatch,
} from '../types'

export interface ChatListParams extends ListParams {
  user?: number
  prisoner?: number
}

/** Ordered by most recent activity. A writer always gets their own; a group gets its managed writers'. */
export const getChats = (params?: ChatListParams) => getList<Chat>('/chat/chats', params)

/** Every thread (every page), most recent activity first. */
export const getAllChats = (params?: Omit<ChatListParams, 'page' | 'page_size'>) => getAllPages<Chat>('/chat/chats', params)

/** full=true adds messages, user_details and the whole prisoner. */
export const getChat = (id: number, full = true) => getOne<Chat>('/chat/chat', { id, full })

export interface MessageListParams extends ListParams {
  chat?: number
  prisoner?: number
  user?: number
  status?: LetterStatus
  /** A group's print queue: { relayChapter: id, status: 'queued', full: true }. */
  relayChapter?: number
  held?: boolean
}

export const getMessages = (params?: MessageListParams) =>
  getList<Message>('/messaging/messages', params)

export const getMessage = (id: number, full = true) =>
  getOne<Message>('/messaging/message', { id, full })

/** A group's current public key and its version: what a group envelope is sealed to. */
export const getGroupPublicKey = (chapter: number) =>
  getOne<{ chapter: number; publicKey: string | null; keyVersion: number }>('/auth/public-key', { chapter })

/** A writer's public key (README "Account keys"): null until they have set up keys, and then it never changes. */
export const getUserPublicKey = (user: number) => getOne<{ user: number; publicKey: string | null }>('/auth/public-key', { user })

/**
 * POST /messaging/message with an Idempotency-Key (the same key on every retry of
 * one letter, so it is never mailed twice). In end-to-end mode the body is
 * `ciphertext`, `nonce` and `envelopes`; `messageText` is refused.
 */
export async function postLetter(body: Record<string, unknown>, idempotencyKey: string): Promise<Message> {
  const response = await client.post<{ data: Message }>('/messaging/message', body, { headers: { 'Idempotency-Key': idempotencyKey } })
  return response.data.data
}

/** POST /messaging/attachment: the file as ciphertext, with its nonce; `type` and `name` describe the original. */
export async function uploadAttachment(input: {
  message: number
  bytes: Uint8Array
  nonce: string
  type: string
  name: string
  idempotencyKey: string
}): Promise<Attachment> {
  const form = new FormData()
  form.append('message', String(input.message))
  form.append('nonce', input.nonce)
  form.append('file', new Blob([input.bytes as BlobPart], { type: input.type }), input.name)
  const response = await client.post<{ data: Attachment }>('/messaging/attachment', form, {
    headers: { 'Content-Type': 'multipart/form-data', 'Idempotency-Key': input.idempotencyKey },
  })
  return response.data.data
}

/** A letter's attachment rows (scans, photos), oldest first. In e2e mode each carries its `nonce`. */
export const getAttachments = (message: number) => getOne<Attachment[]>('/messaging/attachments', { message })

/** The stored file. In end-to-end mode this is ciphertext (decrypt with the letter's content key). */
export async function downloadAttachment(id: number): Promise<Uint8Array> {
  const response = await client.get<ArrayBuffer>('/messaging/attachment', { params: { id }, responseType: 'arraybuffer' })
  return new Uint8Array(response.data)
}

// --- Moving a letter along (README "Letter lifecycle", "PUT /messaging/status") ---
// The letter's relay group (or a superadmin, who cannot decline). Forward only:
// queued to printed to mailed, mailed to returned, queued or printed to declined.
// Anything else is a 409 LetterStatusError.

/** One move, with what goes with it. Return and decline notes are shown to the writer and never encrypted. */
export type StatusMove =
  /** `release: true` prints a held letter on purpose; without it a held letter is refused. */
  | { status: 'printed' | 'mailed'; release?: boolean }
  /** From mailed only. `note`: at most 200 characters, what the envelope said. */
  | { status: 'returned'; reason: ReturnReason; note?: string }
  /**
   * From queued or printed, by the relay group only, held letters included (no
   * `release`). `rule` names one of the facility's own mail rule tags, for a
   * `facility_rule` decline only. `note`: at most 200 characters.
   */
  | { status: 'declined'; reason: DeclineReason; rule?: string; note?: string }

/** PUT /messaging/status: answers the letter with relay_group and status_history (the full=true shape). */
export const setLetterStatus = (id: number, move: StatusMove) => put<Message>('/messaging/status', { id, ...move })

/**
 * PUT /messaging/status/batch: 1 to 200 letters, all or none. If any letter
 * cannot move, nothing changes and the error names it ("Letter 42: …", a 409;
 * a 403 or 404 naming the letters that are not the caller's or do not exist).
 */
export const setLetterStatusBatch = (ids: number[], move: StatusMove) =>
  put<{ status: LetterStatus; count: number; ids: number[] }>('/messaging/status/batch', { ids, ...move })

// --- Filing a reply (README "Reply reference") ---------------------------------

/**
 * GET /messaging/reference?number=: the writer, prisoner, group and letter a
 * reply reference points at. A 400 ReplyReferenceError with condition
 * `checksum` for a number with a mistake in it; a 404 (`unknown`) for one that
 * is not this group's or was never issued. Rate limited per account.
 */
export const lookupReference = (number: string) => getOne<ReferenceLookup>('/messaging/reference', { number })

/** GET /messaging/writers?name=: writers whose letters this group mailed, by current or former pen name (at least 2 characters). */
export const searchWriters = (name: string) => getOne<WriterMatch[]>('/messaging/writers', { name })

// --- Envelopes (README "Sending and reading letters", "Latecomers") --------------

/**
 * GET /messaging/envelopes/missing: letters the group can open whose writer has
 * keys by now and no envelope yet. Open the group's `wrappedKey`, seal the
 * content key to `publicKey`, and post it with addEnvelope. A member of an
 * active group; a 409 in server mode.
 */
export const getMissingEnvelopes = () => getOne<MissingEnvelope[]>('/messaging/envelopes/missing')

/**
 * POST /messaging/envelope: a current reader adds one more permitted reader:
 * a writer who now has keys, or a partner relay group (`keyVersion` is that
 * group's current one). 409 if the reader has one already, or the group rotated.
 */
export const addEnvelope = (envelope: { message: number; readerType: 'user' | 'chapter'; readerId: number; wrappedKey: string; keyVersion?: number }) =>
  post<Envelope & { id: number; message: number }>('/messaging/envelope', envelope)

/**
 * The fields of a letter that can still change (end-to-end mode): a new body
 * under the same content key, `keep`, or for a `choose_relay` hold the group
 * that mails it (README "Moved and freed"; the API refuses any other change of
 * group in end-to-end mode, `400 not_settable_here`).
 */
export type LetterFields = Partial<{
  ciphertext: string
  nonce: string
  relayNoteCiphertext: string | null
  relayNoteNonce: string | null
  keep: boolean
  relayChapter: number
}>

/**
 * PUT /messaging/message (README "PUT /messaging/message"): the writer, the
 * group managing the writer, or an admin, while the letter is queued; a group
 * that only mails a letter may correct a reply it recorded. Ciphertext and nonce
 * travel as a pair.
 */
export const updateLetter = (id: number, fields: LetterFields) =>
  put<{ updatedRows: number[]; newMessage: Partial<Message> & { id: number } }>('/messaging/message', { id, ...fields })

/** DELETE /messaging/message: the same people as an edit; once printed or mailed, only an admin. Attachments go with it. */
export const deleteLetter = (id: number) => del<number>('/messaging/message', { id })
