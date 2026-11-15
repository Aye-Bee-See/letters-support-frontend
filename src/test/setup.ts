import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { configureSessionSharing } from '../auth/sessionChannel'
import { fakeApi } from './fakeApi'

// Set-up for every DOM test (*.test.tsx, the `dom` project in vite.config.ts).

// No test touches the network: src/api/client.ts's axios instance answers from
// fakeApi (src/test/fakeApi.ts). Everything else in the client is the real one:
// its interceptors, toApiError, getOne and the rest.
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  actual.default.defaults.adapter = fakeApi.adapter
  return actual
})

// Tabs share a session over a BroadcastChannel (src/auth/sessionChannel.ts), and
// Node has one that reaches every test file in the process. Each file gets a
// channel of its own, and a signed-out render waits only a moment for a tab
// that isn't there. A test of two tabs renders two apps on this channel.
configureSessionSharing({ channel: `test-${Date.now()}-${Math.random()}`, askWindowMs: 20 })

afterEach(() => {
  // Without Vitest's globals, Testing Library can't unmount by itself.
  cleanup()
  fakeApi.reset()
  vi.restoreAllMocks()
  // The sign-in a render left for "the tab's next load" (src/auth/sessionStore.ts) is not the next test's.
  sessionStorage.clear()
})
