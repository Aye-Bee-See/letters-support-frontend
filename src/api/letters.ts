// Threads (/chat) and letters (/messaging).
import client, { getAllPages, getList, getOne } from './client'
import type { Attachment, Chat, LetterStatus, ListParams, Message } from '../types'

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

// Sending (POST /messaging/message with an Idempotency-Key, ciphertext and
// envelopes) is built with the crypto core in Steps 3 to 5.
// TODO: encrypt before sending
