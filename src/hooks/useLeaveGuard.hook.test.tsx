import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Link, Route, Routes, useNavigationType } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { isGuardEntry, useLeaveGuard } from './useLeaveGuard'

// useLeaveGuard in a page with links (useLeaveGuard.test.ts has the pure click
// decision): while active, an in-app link asks first; once off, it doesn't.

const MESSAGE = 'These codes are shown only once. Leave anyway?'

function CodesPage() {
  const [shown, setShown] = useState(true)
  useLeaveGuard(shown, MESSAGE)
  return (
    <>
      <Link to="/settings">Settings</Link>
      <div data-leave-guard-ok>
        <Link to="/help">Help with the codes</Link>
      </div>
      <button type="button" onClick={() => setShown(false)}>
        I’ve saved them
      </button>
    </>
  )
}

function visit() {
  return renderApp(
    <Routes>
      <Route path="/invite-codes" element={<CodesPage />} />
      <Route path="/settings" element={<p>page: settings</p>} />
      <Route path="/help" element={<p>page: help</p>} />
    </Routes>,
    { at: '/invite-codes' },
  )
}

/** window.confirm, answering `answer` (happy-dom has none of its own). */
function askWith(answer: boolean) {
  const confirm = vi.fn<(message?: string) => boolean>(() => answer)
  vi.stubGlobal('confirm', confirm)
  return confirm
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const unload = () => {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useLeaveGuard', () => {
  it('asks before an in-app link leaves, and stays when the answer is no', async () => {
    const confirm = askWith(false)
    const view = visit()
    await userEvent.setup().click(screen.getByRole('link', { name: 'Settings' }))
    expect(confirm).toHaveBeenCalledExactlyOnceWith(MESSAGE)
    expect(view.location().pathname).toBe('/invite-codes')
  })

  it('leaves when the answer is yes', async () => {
    askWith(true)
    const view = visit()
    await userEvent.setup().click(screen.getByRole('link', { name: 'Settings' }))
    expect(view.location().pathname).toBe('/settings')
  })

  it('lets links inside the marked panel through without asking', async () => {
    const confirm = askWith(true)
    const view = visit()
    await userEvent.setup().click(screen.getByRole('link', { name: 'Help with the codes' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(view.location().pathname).toBe('/help')
  })

  it('has the browser ask before unloading while active', () => {
    visit()
    expect(unload()).toBe(true)
  })

  it('asks nothing once turned off', async () => {
    const confirm = askWith(true)
    const view = visit()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'I’ve saved them' }))
    expect(unload()).toBe(false)
    await user.click(screen.getByRole('link', { name: 'Settings' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(view.location().pathname).toBe('/settings')
  })

  it('asks nothing once the page is gone', () => {
    const view = visit()
    view.unmount()
    expect(unload()).toBe(false)
  })
})

// The Back button: with `back`, a duplicate history entry on top while on.
// happy-dom's history doesn't traverse, so Back is played as the browser does
// it: the page's own entry becomes current (replaceState), then popstate.

function BackCodesPage() {
  const [shown, setShown] = useState(true)
  useLeaveGuard(shown, MESSAGE, { back: true })
  return (
    <>
      <Link to="/settings">Settings</Link>
      <button type="button" onClick={() => setShown(false)}>
        I’ve saved them
      </button>
    </>
  )
}

function Arrived() {
  return <p>page: settings, by {useNavigationType()}</p>
}

function visitWithBack() {
  window.history.replaceState({ page: 'codes' }, '')
  return renderApp(
    <Routes>
      <Route path="/invite-codes" element={<BackCodesPage />} />
      <Route path="/settings" element={<Arrived />} />
    </Routes>,
    { at: '/invite-codes' },
  )
}

/** Back from the duplicate: the page's own entry is current, and the browser says so. */
function pressBack() {
  window.history.replaceState({ page: 'codes' }, '')
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

describe('useLeaveGuard with the Back button', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('puts a duplicate of the page’s entry on top, keeping its state', () => {
    const before = window.history.length
    visitWithBack()
    expect(window.history.length).toBe(before + 1)
    expect(isGuardEntry(window.history.state)).toBe(true)
    expect(window.history.state).toMatchObject({ page: 'codes' })
  })

  it('asks on Back, and puts the duplicate back when the answer is no', () => {
    const confirm = askWith(false)
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    visitWithBack()
    pressBack()
    expect(confirm).toHaveBeenCalledExactlyOnceWith(MESSAGE)
    expect(isGuardEntry(window.history.state)).toBe(true)
    expect(back).not.toHaveBeenCalled()
  })

  it('goes back once more when the answer is yes, and asks nothing on the way', () => {
    const confirm = askWith(true)
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    visitWithBack()
    pressBack()
    expect(back).toHaveBeenCalledOnce()
    pressBack()
    expect(confirm).toHaveBeenCalledOnce()
    expect(back).toHaveBeenCalledOnce()
  })

  it('takes the duplicate out once turned off, and Back no longer asks', async () => {
    const confirm = askWith(true)
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    visitWithBack()
    await userEvent.setup().click(screen.getByRole('button', { name: 'I’ve saved them' }))
    await new Promise((r) => setTimeout(r, 0))
    expect(back).toHaveBeenCalledOnce()
    pressBack()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('leaves by a link in place of the duplicate, not after it', async () => {
    askWith(true)
    visitWithBack()
    await userEvent.setup().click(screen.getByRole('link', { name: 'Settings' }))
    expect(screen.getByText('page: settings, by REPLACE')).toBeTruthy()
  })
})
