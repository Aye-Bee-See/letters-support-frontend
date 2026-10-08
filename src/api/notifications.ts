import { getAllPages, getList, put } from './client'
import type { Notification } from '../types'

// The caller's notification feed (README "Push notifications"). Entries hold
// ids and states, never letter content.

/**
 * Every unread entry, newest first, following pages (the API caps page_size at
 * 100; entries go after NOTIFICATION_DAYS, so the unread feed stays bounded).
 */
export const getUnreadNotifications = () => getAllPages<Notification>('/auth/notifications', { unread: true })

/** How many entries are unread, from one small page of the unread feed (its `total`). */
export const getUnreadCount = () => getList<Notification>('/auth/notifications', { unread: true, page_size: 1 }).then((r) => r.total)

/** Mark entries read; `undefined` marks every entry. Answers how many are still unread. */
export const markNotificationsRead = (ids?: number[]) =>
  put<{ marked: number; unread: number }>('/auth/notifications/read', ids ? { ids } : {})

/** The newest entries, read or not (README "The feed"): a page of the caller's feed, newest first. */
export const getNotifications = (pageSize = 20) =>
  getList<Notification>('/auth/notifications', { page_size: pageSize }).then((r) => r.items)
