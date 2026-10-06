import { getList, put } from './client'
import type { Notification } from '../types'

// The caller's notification feed (README "Push notifications"). Entries hold
// ids and states, never letter content.

/** Unread entries, newest first (up to 100: enough to mark unread threads). */
export const getUnreadNotifications = () =>
  getList<Notification>('/auth/notifications', { unread: true, page_size: 100 }).then((r) => r.items)

/** Mark entries read. */
export const markNotificationsRead = (ids: number[]) =>
  put<{ marked: number; unread: number }>('/auth/notifications/read', { ids })

/** The newest entries, read or not (README "The feed"): a page of the caller's feed, newest first. */
export const getNotifications = (pageSize = 20) =>
  getList<Notification>('/auth/notifications', { page_size: pageSize }).then((r) => r.items)
