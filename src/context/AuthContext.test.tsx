import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { configureSessionSharing } from '../auth/sessionChannel'
import { RequireAuth } from '../components/layout/RouteGuards'
import UnlockGate from '../components/layout/UnlockGate'
import { firstKeysForSplitAccount, KDF_PARAMS, signInKeys } from '../crypto'
import { fakeApi, reply, type FakeRequest } from '../test/fakeApi'
import { renderApp, type RenderOptions } from '../test/render'
import { TEST_TOKEN, testUser } from '../test/session'
import type { KeyBundle, LoginParams } from '../types'

// Staying signed in without storing a key (issue #76): a reload comes back
// signed in but locked, from the token the tab remembers; a new tab takes the
// whole session, keys and all, from a tab that has it; and the tabs of one
// session change and end together. Each render here is a tab: they share the
// test file's BroadcastChannel and, as tabs of one window would not, its
// sessionStorage, which the tests about tabs therefore leave alone.

const STORE = 'paperkites-session'
const PASSWORD = 'correct horse battery staple'
const params: LoginParams = { scheme: 'split', kdfSalt: 'AAECAwQFBgcICQoLDA0ODw==', kdfParams: { ...KDF_PARAMS } }
const writer = testUser({ id: 7, username: 'sam', role: 'user' })
let bundle: KeyBundle

beforeAll(async () => {
  // A real key bundle: what GET /auth/keys answers for an account with this password.
  const keys = await signInKeys(PASSWORD, params)
  const made = await firstKeysForSplitAccount(keys.wrapKey, params)
  bundle = { ...made.keyFields, hasRecovery: true, orgKey: null }
}, 30000)

afterEach(() => {
  configureSessionSharing({ askWindowMs: 20 })
})

const week = () => Date.now() + 7 * 24 * 60 * 60 * 1000
const remember = (token = 'stored-token', expires = week(), userId = writer.id) => sessionStorage.setItem(STORE, JSON.stringify({ token, expires, userId }))

/** The API for the remembered sign-in: the account and its (still wrapped) keys, for that token only. */
function serveAccount(token = 'stored-token') {
  const asked: FakeRequest[] = []
  const answer = (body: unknown) => (r: FakeRequest) => {
    asked.push(r)
    return r.authorization === `Bearer ${token}` ? body : reply.error(401, { name: 'AuthenticationError' })
  }
  fakeApi.on('GET', '/auth/user', answer(writer))
  fakeApi.on('GET', '/auth/keys', answer(bundle))
  return asked
}

/** One tab: the writer's pages, the two that read letters behind the unlock gate. */
function tab(at: string, session?: RenderOptions['session']) {
  return renderApp(
    <Routes>
      <Route path="/login" element={<p>sign-in page</p>} />
      <Route element={<RequireAuth roles={['user', 'chapter']} />}>
        <Route element={<UnlockGate />}>
          <Route path="/inbox" element={<p>the inbox</p>} />
          <Route path="/threads/:id" element={<p>a letter, opened</p>} />
        </Route>
      </Route>
    </Routes>,
    { at, session },
  )
}

describe('a reload', () => {
  it('comes back signed in but locked, from the token the tab remembers', async () => {
    remember()
    const asked = serveAccount()
    const view = tab('/inbox')

    // A page that needs no key works at once: no sign-in page, no password.
    expect(await screen.findByText('the inbox')).toBeTruthy()
    const auth = view.auth()
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.username).toBe('sam')
    expect(auth.token).toBe('stored-token')
    expect(auth.keys?.wrappedPrivateKey).toBe(bundle.wrappedPrivateKey)
    expect(auth.locked).toBe(true)
    expect(auth.keypair).toBeNull()
    // The account and its keys were asked for with the remembered token, and only those.
    expect(asked.map((r) => `${r.path} ${r.authorization}`).sort()).toEqual(['/auth/keys Bearer stored-token', '/auth/user Bearer stored-token'])
    // What is stored is still the token, its expiry and the account: never a key.
    expect(Object.keys(JSON.parse(sessionStorage.getItem(STORE) ?? '{}') as object).sort()).toEqual(['expires', 'token', 'userId'])
    expect(sessionStorage.length).toBe(1)
  })

  it('asks a locked session to unlock before opening a letter, and opens it with the password alone', async () => {
    remember()
    const asked = serveAccount()
    const view = tab('/threads/3')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { name: 'Unlock your letters' })).toBeTruthy()
    expect(screen.queryByText('a letter, opened')).toBeNull()

    await user.type(screen.getByLabelText('Password'), 'not the password')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect((await screen.findByText(/That password didn’t open your keys/, {}, { timeout: 20000 })).getAttribute('role')).toBe('alert')
    expect(view.auth().locked).toBe(true)

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('a letter, opened', {}, { timeout: 20000 })).toBeTruthy()
    expect(view.auth().locked).toBe(false)
    expect(view.auth().keypair?.publicKey).toBe(bundle.publicKey)
    // Unlocking is the device's work: the API was asked nothing more, and the password went nowhere.
    expect(asked).toHaveLength(2)
    expect(fakeApi.calls.every((r) => !JSON.stringify(r).includes(PASSWORD))).toBe(true)
  }, 60000)

  it('asks a group admin on every group page, their inbox too: a locked page can’t tell holding the group key from not', async () => {
    const admin = testUser({ id: 8, username: 'kit', role: 'chapter', chapterId: 10, penName: null })
    remember('stored-token', week(), admin.id)
    fakeApi.on('GET', '/auth/user', admin)
    fakeApi.on('GET', '/auth/keys', bundle)
    const view = tab('/inbox')

    expect(await screen.findByRole('heading', { name: 'Unlock your letters' })).toBeTruthy()
    expect(screen.queryByText('the inbox')).toBeNull()
    expect(view.auth().isChapter).toBe(true)
    expect(view.auth().locked).toBe(true)
  })

  it('drops a remembered token that has expired, and asks the API nothing', async () => {
    remember('stored-token', Date.now() - 1000)
    const asked = serveAccount()
    const view = tab('/inbox')

    expect(await screen.findByText('sign-in page')).toBeTruthy()
    expect(view.auth().isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(STORE)).toBeNull()
    expect(asked).toEqual([])
  })

  it('drops a stored value that isn’t what this site writes', async () => {
    for (const value of ['not json', '{"token":"","expires":1,"userId":7}', JSON.stringify({ token: 't', expires: 'never', userId: 7 }), 'null']) {
      sessionStorage.setItem(STORE, value)
      const asked = serveAccount()
      const view = tab('/inbox')
      expect(await screen.findByText('sign-in page')).toBeTruthy()
      expect(sessionStorage.getItem(STORE)).toBeNull()
      expect(asked).toEqual([])
      view.unmount()
    }
  })

  it('forgets a remembered token the API no longer takes, and shows the sign-in page', async () => {
    remember('revoked-token')
    serveAccount('some-other-token')
    const view = tab('/inbox')

    expect(await screen.findByText('sign-in page')).toBeTruthy()
    expect(view.auth().isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(STORE)).toBeNull()
  })

  it('keeps the token for the next load when the server can’t be reached', async () => {
    remember()
    fakeApi.on('GET', '/auth/user', reply.network())
    fakeApi.on('GET', '/auth/keys', reply.network())
    tab('/inbox')

    expect(await screen.findByText('sign-in page')).toBeTruthy()
    expect(sessionStorage.getItem(STORE)).not.toBeNull()
  })
})

describe('a new tab', () => {
  it('takes the unlocked session over from a tab that is signed in, with no request and no password', async () => {
    // Long enough that only an answer ends the wait.
    configureSessionSharing({ askWindowMs: 5000 })
    const first = tab('/inbox', { role: 'user', user: { id: 7, username: 'sam' } })
    await within(first.container).findByText('the inbox')
    sessionStorage.clear() // a new tab has no storage of its own to restore from

    const second = tab('/threads/3')
    expect(await within(second.container).findByText('a letter, opened')).toBeTruthy()
    const auth = second.auth()
    expect(auth.user?.username).toBe('sam')
    expect(auth.token).toBe(TEST_TOKEN)
    expect(auth.locked).toBe(false)
    expect(auth.keypair).toEqual(first.auth().keypair)
    expect(fakeApi.calls).toEqual([])
  })

  it('is signed out when no tab answers: a tab that is itself signed out stays silent', async () => {
    const first = tab('/inbox')
    await within(first.container).findByText('sign-in page')
    const second = tab('/inbox')
    expect(await within(second.container).findByText('sign-in page')).toBeTruthy()
    expect(second.auth().isAuthenticated).toBe(false)
  })
})

describe('the tabs of one session', () => {
  /** Two tabs sharing the test session, and a third signed in separately (another token). */
  async function threeTabs() {
    configureSessionSharing({ askWindowMs: 5000 })
    const first = tab('/inbox', { role: 'user', user: { id: 7, username: 'sam' } })
    await within(first.container).findByText('the inbox')
    sessionStorage.clear()
    const second = tab('/inbox')
    await within(second.container).findByText('the inbox')
    const apart = tab('/inbox', {
      result: { user: testUser({ id: 9, username: 'robin' }), token: { token: 'another-token', expires: week() } },
      bundle: { ...bundle },
      keypair: { publicKey: 'robin-public', privateKey: 'robin-private' },
      groupKeypair: null,
    })
    await within(apart.container).findByText('the inbox')
    return { first, second, apart }
  }

  it('end together: signing out in one ends the others, and leaves a separate sign-in alone', async () => {
    const { first, second, apart } = await threeTabs()

    act(() => first.auth().endSession())
    await waitFor(() => expect(second.auth().isAuthenticated).toBe(false))
    expect(await within(second.container).findByText('sign-in page')).toBeTruthy()
    expect(second.auth().endedNotice).toBe('You signed out in another tab.')
    expect(second.auth().keypair).toBeNull()
    // The remembered sign-in goes with the session.
    expect(sessionStorage.getItem(STORE)).toBeNull()
    // Another account's session, with its own token, is its own.
    expect(apart.auth().user?.username).toBe('robin')
    expect(within(apart.container).getByText('the inbox')).toBeTruthy()
  })

  it('change together: a new token and a chosen pen name reach the other tab', async () => {
    const { first, second, apart } = await threeTabs()

    act(() => first.auth().tokenRefreshed('fresh-token', week()))
    await waitFor(() => expect(second.auth().token).toBe('fresh-token'))
    act(() => second.auth().penNameChosen('Quiet River'))
    await waitFor(() => expect(first.auth().user?.penName).toBe('Quiet River'))
    // And the tabs still end together under the new token.
    act(() => second.auth().endSession())
    await waitFor(() => expect(first.auth().isAuthenticated).toBe(false))
    expect(apart.auth().token).toBe('another-token')
  })
})

describe('a locked tab beside an unlocked one', () => {
  it('is unlocked when the other unlocks', async () => {
    // Both tabs reloaded: both restored from the remembered token, both locked.
    configureSessionSharing({ askWindowMs: 50 })
    remember()
    serveAccount()
    const first = tab('/inbox')
    await within(first.container).findByText('the inbox')
    const second = tab('/threads/3')
    await within(second.container).findByRole('heading', { name: 'Unlock your letters' })
    expect(second.auth().locked).toBe(true)

    // The first is unlocked (as its own prompt would do): the second opens too.
    act(() => first.auth().unlocked({ publicKey: bundle.publicKey as string, privateKey: 'opened-private-key' }, null))
    expect(await within(second.container).findByText('a letter, opened')).toBeTruthy()
    expect(second.auth().keypair?.privateKey).toBe('opened-private-key')
  })

  it('keeps its keys when the locked tab announces a change, and takes the change', async () => {
    configureSessionSharing({ askWindowMs: 50 })
    // A tab restored from the remembered token, locked: no other tab answered it in time.
    remember()
    serveAccount()
    const lockedTab = tab('/inbox')
    await within(lockedTab.container).findByText('the inbox')
    expect(lockedTab.auth().locked).toBe(true)
    // A tab of the same session (the same token) with its keys open.
    const openTab = tab('/inbox', {
      result: { user: writer, token: { token: 'stored-token', expires: week() } },
      bundle: { ...bundle },
      keypair: { publicKey: bundle.publicKey as string, privateKey: 'opened-private-key' },
      groupKeypair: null,
    })
    await within(openTab.container).findByText('the inbox')

    act(() => lockedTab.auth().penNameChosen('Quiet River'))
    await waitFor(() => expect(openTab.auth().user?.penName).toBe('Quiet River'))
    expect(openTab.auth().locked).toBe(false)
    expect(openTab.auth().keypair?.privateKey).toBe('opened-private-key')
  })
})
