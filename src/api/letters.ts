// Threads (/chat) and letters (/messaging).
import { getAllPages, getList, getOne } from './client'
import type { Chat, LetterStatus, ListParams, Message } from '../types'

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

// Sending (POST /messaging/message with an Idempotency-Key, ciphertext and
// envelopes) is built with the crypto core in Steps 3 to 5.
// TODO: encrypt before sending
