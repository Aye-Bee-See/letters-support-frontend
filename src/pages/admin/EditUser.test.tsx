import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeApi, reply } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import { testUser } from '../../test/session'
import EditUser from './EditUser'

// Taking a group's owner, or the last holder of its key, out of the group is
// refused (API #232), and the refusal names the group the account is in. By
// its name, never its number: the page loads the group's name after the
// account, and the controls work meanwhile. The API is faked.

const account = testUser({ id: 42, username: 'chapter1', name: 'Chapter One', role: 'chapter', chapterId: 1 })
const lastKeyHolder = reply.error(409, { name: 'RoleChangeError', condition: 'last_key_holder', error: 'User 42 holds the last copy of chapter 1’s key.' })

function open() {
  vi.stubGlobal('confirm', vi.fn(() => true))
  fakeApi.on('GET', '/auth/user', account, { params: { id: '42' } })
  fakeApi.on('PUT', '/auth/user', lastKeyHolder)
  return renderApp(
    <Routes>
      <Route path="/admin/users/:id" element={<EditUser />} />
    </Routes>,
    { at: '/admin/users/42', session: { role: 'admin', user: { id: 1, username: 'admin' } } },
  )
}

async function makeWriter() {
  const user = userEvent.setup()
  await user.selectOptions(await screen.findByLabelText('Role'), 'user')
  await user.click(screen.getByRole('button', { name: 'Change role' }))
  return (await screen.findByRole('alert')).textContent ?? ''
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EditUser: a role change the group’s key stands in the way of', () => {
  it('names the group once its name is loaded, and keeps the form as it was', async () => {
    fakeApi.on('GET', '/chapter/chapter', { id: 1, name: 'Test Chapter', accountStatus: 'active' })
    open()
    await screen.findAllByText(/Test Chapter/)
    const text = await makeWriter()
    expect(text).toMatch(/^Hand Test Chapter’s key to another group admin first/)
    expect((screen.getByLabelText('Role') as HTMLSelectElement).value).toBe('user')
  })

  it('says “their group”, never the group’s number, while the name is still loading', async () => {
    // The group's name never arrives.
    fakeApi.on('GET', '/chapter/chapter', () => new Promise(() => {}))
    open()
    const text = await makeWriter()
    expect(text).toMatch(/^Hand their group’s key to another group admin first/)
    expect(text).not.toMatch(/group #1|#1\b/)
  })
})
