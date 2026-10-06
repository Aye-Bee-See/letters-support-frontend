import { describe, expect, it } from 'vitest'
import { leavesForAppPage, type ClickLike } from './useLeaveGuard'

const ORIGIN = 'http://localhost:3001'
const HERE = { origin: ORIGIN, pathname: '/settings/invite-codes' }

/** A fake <a> (and what it sits inside), enough for closest/hasAttribute. */
function link({ href = '/settings', target = '', download = false, inOkPanel = false } = {}) {
  const anchor = {
    href: new URL(href, ORIGIN).href,
    target,
    hasAttribute: (name: string) => name === 'download' && download,
    closest: (selector: string) => (selector === '[data-leave-guard-ok]' && inOkPanel ? {} : null),
  }
  // The clicked element (say, the text inside the link) finds the link as its closest a[href].
  return { closest: (selector: string) => (selector === 'a[href]' ? anchor : null) } as unknown as EventTarget
}

const click = (target: EventTarget | null, over: Partial<ClickLike> = {}): ClickLike => ({
  target,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...over,
})

describe('leavesForAppPage', () => {
  it('catches a plain click on a link to another page of the app', () => {
    expect(leavesForAppPage(click(link()), HERE)).toBe(true)
    expect(leavesForAppPage(click(link({ href: `${ORIGIN}/inbox?tab=writers`, target: '_self' })), HERE)).toBe(true)
  })

  it('lets through new tabs, other sites, downloads, and links inside the panel', () => {
    expect(leavesForAppPage(click(link({ target: '_blank' })), HERE)).toBe(false)
    expect(leavesForAppPage(click(link({ href: 'https://example.org/help' })), HERE)).toBe(false)
    expect(leavesForAppPage(click(link({ download: true })), HERE)).toBe(false)
    expect(leavesForAppPage(click(link({ inOkPanel: true })), HERE)).toBe(false)
    expect(leavesForAppPage(click(link({ href: '/settings/invite-codes?page=2' })), HERE)).toBe(false)
  })

  it('lets through modified, non-left and already handled clicks, and clicks off any link', () => {
    expect(leavesForAppPage(click(link(), { metaKey: true }), HERE)).toBe(false)
    expect(leavesForAppPage(click(link(), { ctrlKey: true }), HERE)).toBe(false)
    expect(leavesForAppPage(click(link(), { button: 1 }), HERE)).toBe(false)
    expect(leavesForAppPage(click(link(), { defaultPrevented: true }), HERE)).toBe(false)
    expect(leavesForAppPage(click({ closest: () => null } as unknown as EventTarget), HERE)).toBe(false)
    expect(leavesForAppPage(click(null), HERE)).toBe(false)
  })
})
