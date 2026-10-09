import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
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

afterEach(() => {
  // Without Vitest's globals, Testing Library can't unmount by itself.
  cleanup()
  fakeApi.reset()
  vi.restoreAllMocks()
})
