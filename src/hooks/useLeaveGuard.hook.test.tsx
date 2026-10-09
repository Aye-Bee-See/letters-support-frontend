import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { useLeaveGuard } from './useLeaveGuard'

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
