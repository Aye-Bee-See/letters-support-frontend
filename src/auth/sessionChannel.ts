import type { Keypair } from '../crypto'
import type { KeyBundle, TwoFactorReason, User } from '../types'

// One session, shared by the tabs of this browser profile that have it open
// (issue #76). A tab that opens with no session asks on a BroadcastChannel
// whether another is signed in, and takes the session over: the token, the
// user, the key bundle and the unlocked keypairs. After that the tabs keep in
// step: a change in one (a new token, the group key, unlocking) reaches the
// others, and so does the end of the session.
//
// Nothing is written to storage here. A BroadcastChannel reaches only pages of
// this origin in this browser profile, which already run the same script with
// the same reach; it never crosses to another site, profile or device. It works
// only while a signed-in tab is open: close them all and nothing is left.
//
// Tabs are told apart by token. Two tabs signed in separately (to two accounts,
// or twice to one) are two sessions and leave each other alone: a change or an
// ending names the token it is about, and only tabs holding that token act.

/** Everything a session is, as AuthContext holds it. */
export interface SharedSession {
  user: User
  token: string
  /** Token expiry, Unix ms. */
  expires: number
  /** The account's key bundle: wrapped keys only. */
  keys: KeyBundle | null
  /** The account's unlocked keypair; null in a session restored after a reload and not yet unlocked. */
  keypair: Keypair | null
  /** The group's unlocked keypair, for a group admin who holds it. */
  groupKeypair: Keypair | null
  twoFactorSetupRequired: TwoFactorReason[] | null
}

type Message =
  /** A tab with no session: is anyone signed in? */
  | { type: 'ask'; id: string }
  /** A signed-in tab's answer to the tab that asked. */
  | { type: 'offer'; to: string; session: SharedSession }
  /** The session that had token `was` is now this. */
  | { type: 'changed'; was: string; session: SharedSession }
  /** The session with this token is over. */
  | { type: 'ended'; token: string; notice?: string }

let channelName = 'paperkites-session'
/** How long a new tab waits for an answer. Another tab answers in a few milliseconds; this is the wait when none will. */
let askWindowMs = 300

/** For tests: a channel of their own, and no long wait for an answer that isn't coming. */
export function configureSessionSharing(options: { channel?: string; askWindowMs?: number }): void {
  if (options.channel !== undefined) channelName = options.channel
  if (options.askWindowMs !== undefined) askWindowMs = options.askWindowMs
}

const supported = () => typeof BroadcastChannel !== 'undefined'

/** Whether asking another tab is possible at all in this browser. */
export const canShareSessions = supported

function open(): BroadcastChannel | null {
  try {
    return supported() ? new BroadcastChannel(channelName) : null
  } catch {
    return null
  }
}

/** What arrived, if it has the shape of a session that is still good; anything else is ignored. */
function sessionIn(value: unknown, now = Date.now()): SharedSession | null {
  if (typeof value !== 'object' || value === null) return null
  const s = value as Partial<SharedSession>
  if (typeof s.token !== 'string' || s.token === '') return null
  if (typeof s.expires !== 'number' || s.expires <= now) return null
  if (typeof s.user !== 'object' || s.user === null || typeof s.user.id !== 'number') return null
  return {
    user: s.user,
    token: s.token,
    expires: s.expires,
    keys: s.keys ?? null,
    keypair: s.keypair ?? null,
    groupKeypair: s.groupKeypair ?? null,
    twoFactorSetupRequired: s.twoFactorSetupRequired ?? null,
  }
}

function messageIn(data: unknown): Message | null {
  if (typeof data !== 'object' || data === null) return null
  const m = data as { type?: unknown }
  return m.type === 'ask' || m.type === 'offer' || m.type === 'changed' || m.type === 'ended' ? (data as Message) : null
}

/**
 * Ask the other tabs for a session. Resolves with the first unlocked one
 * offered, at once; else, when the wait is over, with a locked one if any was
 * offered (signed in, keys not open: better than signed out); else null.
 */
export function askOtherTabs(): Promise<SharedSession | null> {
  const channel = open()
  if (!channel) return Promise.resolve(null)
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return new Promise((resolve) => {
    let locked: SharedSession | null = null
    const finish = (session: SharedSession | null) => {
      clearTimeout(timer)
      channel.close()
      resolve(session)
    }
    const timer = setTimeout(() => finish(locked), askWindowMs)
    channel.onmessage = (event: MessageEvent) => {
      const message = messageIn(event.data)
      if (message?.type !== 'offer' || message.to !== id) return
      const session = sessionIn(message.session)
      if (!session) return
      if (session.keypair) finish(session)
      else locked ??= session
    }
    try {
      channel.postMessage({ type: 'ask', id } satisfies Message)
    } catch {
      finish(null)
    }
  })
}

export interface SessionChannelHandlers {
  /** This tab's session now, to offer a tab that asks; null stays silent (signed out, or still on the sign-in page). */
  current: () => SharedSession | null
  /** Another tab changed the session this tab shares. */
  onChanged: (session: SharedSession) => void
  /** Another tab ended it. */
  onEnded: (notice?: string) => void
}

export interface SessionChannel {
  /** Tell the tabs sharing the session that had token `was` what it is now. */
  announceChanged: (was: string, session: SharedSession) => void
  /** Tell them it is over. */
  announceEnded: (token: string, notice?: string) => void
  close: () => void
}

/** This tab's place on the channel for as long as it is open; null where the browser has none. */
export function joinSessionChannel(handlers: SessionChannelHandlers): SessionChannel | null {
  const channel = open()
  if (!channel) return null
  const post = (message: Message) => {
    try {
      channel.postMessage(message)
    } catch {
      // A session that can't be cloned or a closed channel: the other tabs carry on as they were.
    }
  }
  channel.onmessage = (event: MessageEvent) => {
    const message = messageIn(event.data)
    if (!message) return
    const mine = handlers.current()
    if (message.type === 'ask') {
      if (mine && typeof message.id === 'string') post({ type: 'offer', to: message.id, session: mine })
    } else if (message.type === 'changed') {
      const session = sessionIn(message.session)
      if (mine && session && message.was === mine.token && session.user.id === mine.user.id) handlers.onChanged(session)
    } else if (message.type === 'ended') {
      if (mine && message.token === mine.token) handlers.onEnded(typeof message.notice === 'string' ? message.notice : undefined)
    }
  }
  return {
    announceChanged: (was, session) => post({ type: 'changed', was, session }),
    announceEnded: (token, notice) => post({ type: 'ended', token, ...(notice ? { notice } : {}) }),
    close: () => channel.close(),
  }
}
