import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getUnreadCount } from '../api/notifications'

// The header's unread count (README "The feed"): asked for once on mount and
// once after each navigation, never polled. A page that marks entries read
// announces the count the API answered, so the header drops at once rather than
// on the next navigation.

const listeners = new Set<(count: number) => void>()
/** Bumped by every announcement, so a fetch started before one doesn't overwrite it with an older count. */
let announced = 0

/** After PUT /auth/notifications/read: its `unread`. */
export function announceUnreadCount(count: number) {
  announced++
  listeners.forEach((listener) => listener(count))
}

/** The caller's unread count, or null before it is known (or when `enabled` is false). */
export function useUnreadCount(enabled: boolean): number | null {
  const { pathname } = useLocation()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    let current = true
    const startedAt = announced
    getUnreadCount()
      .then((n) => {
        if (current && startedAt === announced) setCount(n)
      })
      // The count is a nicety: on a failure the header shows none.
      .catch(() => null)
    return () => {
      current = false
    }
  }, [enabled, pathname])

  useEffect(() => {
    listeners.add(setCount)
    return () => {
      listeners.delete(setCount)
    }
  }, [])

  return enabled ? count : null
}
