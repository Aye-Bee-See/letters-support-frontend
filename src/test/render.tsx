// A test helper, never hot-reloaded: its components are private to renderApp.
/* eslint-disable react-refresh/only-export-components */
import { render, type RenderResult } from '@testing-library/react'
import { useLayoutEffect, useState, type ReactNode } from 'react'
import { MemoryRouter, useLocation, type Location } from 'react-router-dom'
import type { SignedIn } from '../auth/signIn'
import { AuthProvider } from '../context/AuthContext'
import type { AuthState } from '../context/auth-context'
import { GroupProvider } from '../context/GroupContext'
import { useAuth } from '../hooks/useAuth'
import { signedInAs, type SessionSeed } from './session'

// Render a component as the app would: inside a router, AuthProvider and
// GroupProvider, optionally signed in. The API answers from fakeApi
// (src/test/setup.ts); set up its routes before rendering.

export interface RenderOptions {
  /** Where the router starts: a path, or a path with `state` (as a <Navigate> would leave). */
  at?: string | { pathname: string; search?: string; state?: unknown }
  /** Signed in as this before anything renders: a seed (src/test/session.ts) or a whole SignedIn. */
  session?: SessionSeed | SignedIn
}

export interface AppRender extends RenderResult {
  /** The router's location now. */
  location: () => Location
  /** The session now, as useAuth() gives it. */
  auth: () => AuthState
}

/** Starts the session before its children first render, so a guard never sees a signed-out moment. */
function Seed({ signedIn, children }: { signedIn: SignedIn | null; children: ReactNode }) {
  const { startSession } = useAuth()
  const [ready, setReady] = useState(signedIn === null)
  useLayoutEffect(() => {
    if (!signedIn) return
    startSession(signedIn)
    // In the same commit as the session, so the children's first render is signed in.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true)
    // Once, on mount: the seed is the session the test starts with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ready ? children : null
}

function Probe({ into }: { into: { location: Location | null; auth: AuthState | null } }) {
  // Written during render on purpose: the test reads the latest after each act().
  // eslint-disable-next-line react-hooks/immutability
  into.location = useLocation()
  // eslint-disable-next-line react-hooks/immutability
  into.auth = useAuth()
  return null
}

const isSignedIn = (session: SessionSeed | SignedIn): session is SignedIn => 'result' in session

export function renderApp(ui: ReactNode, options: RenderOptions = {}): AppRender {
  const at = options.at ?? '/'
  const signedIn = options.session ? (isSignedIn(options.session) ? options.session : signedInAs(options.session)) : null
  const seen: { location: Location | null; auth: AuthState | null } = { location: null, auth: null }
  const result = render(
    <MemoryRouter initialEntries={[at]}>
      <AuthProvider>
        <GroupProvider>
          <Seed signedIn={signedIn}>
            <Probe into={seen} />
            {ui}
          </Seed>
        </GroupProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
  return {
    ...result,
    location: () => {
      if (!seen.location) throw new Error('renderApp: nothing rendered yet')
      return seen.location
    },
    auth: () => {
      if (!seen.auth) throw new Error('renderApp: nothing rendered yet')
      return seen.auth
    },
  }
}
