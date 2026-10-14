import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { fakeApi, reply, type FakeRequest } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import PrintQueue from './PrintQueue'

// The print queue by keyboard alone: rows move with j/k and the arrows, Space
// and `a` select, Enter opens, `p` marks the selection printed (held letters
// through the same question), and keys in the checkboxes or the decline form
// are theirs. The API is faked.

const letter = (id: number, held = false) => ({
  id,
  chat: id,
  sender: 'user',
  status: 'queued',
  heldReason: held ? 'facility_moved' : null,
  paper: false,
  relayChapter: 10,
  prisoner_details: null,
  user_details: null,
  createdAt: '2026-10-07T12:00:00.000Z',
  updatedAt: '2026-10-07T12:00:00.000Z',
})

/** The queue's letters by filter: queued (not held) 1 to 3, held 4. */
function serveQueue() {
  const marked: FakeRequest[] = []
  let queued = [letter(1), letter(2), letter(3)]
  fakeApi.on('GET', '/messaging/messages', (r: FakeRequest) => {
    const items = r.params.status !== 'queued' ? [] : r.params.held === 'true' ? [letter(4, true)] : queued
    return reply.list(items)
  })
  fakeApi.on('PUT', '/messaging/status/batch', (r: FakeRequest) => {
    marked.push(r)
    const ids = (r.body as { ids: number[] }).ids
    queued = queued.filter((m) => !ids.includes(m.id))
    return { status: 'printed', count: ids.length, ids }
  })
  return marked
}

function show(search = '?tab=print') {
  return renderApp(
    <Routes>
      <Route path="/inbox" element={<PrintQueue chapterId={10} keyState="ready" />} />
      <Route path="/letters/:id/print" element={<p>print page</p>} />
    </Routes>,
    { at: `/inbox${search}`, session: { role: 'chapter', groupKey: 'held' } },
  )
}

const rows = () => screen.getAllByRole('row').filter((r) => r.classList.contains('queue-row'))

describe('PrintQueue by keyboard', () => {
  it('moves between rows with j/k and the arrows, one row in the tab order', async () => {
    serveQueue()
    const user = userEvent.setup()
    show()
    await screen.findByText(/letter 3/)
    expect(rows().map((r) => r.tabIndex)).toEqual([0, -1, -1])
    expect(screen.getByText(/Keyboard: j\/k move, Space select, Enter open, p print/)).toBeTruthy()

    rows()[0].focus()
    await user.keyboard('j')
    expect(document.activeElement).toBe(rows()[1])
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(document.activeElement).toBe(rows()[2])
    await user.keyboard('k{ArrowUp}{ArrowUp}')
    expect(document.activeElement).toBe(rows()[0])
    expect(rows().map((r) => r.tabIndex)).toEqual([0, -1, -1])
  })

  it('selects with Space and a, and marks the selection printed with p', async () => {
    const marked = serveQueue()
    const user = userEvent.setup()
    show()
    await screen.findByText(/letter 3/)
    rows()[0].focus()
    await user.keyboard(' j ')
    expect(screen.getByText('2 selected')).toBeTruthy()
    await user.keyboard('p')
    await screen.findByText('2 letters marked printed.')
    expect(marked).toHaveLength(1)
    expect(marked[0].body).toEqual({ ids: [1, 2], status: 'printed' })
    // Focus comes back to the rows once the list has reloaded.
    await waitFor(() => expect(rows().length).toBe(1))
    await waitFor(() => expect(document.activeElement).toBe(rows()[0]))

    await user.keyboard('a')
    expect(screen.getByText('1 selected')).toBeTruthy()
    await user.keyboard('a')
    expect(screen.getByText('Select letters to mark them together.')).toBeTruthy()
  })

  it('marking the whole page leaves focus on the notice, not nowhere', async () => {
    serveQueue()
    const user = userEvent.setup()
    show()
    await screen.findByText(/letter 3/)
    rows()[0].focus()
    await user.keyboard('ap')
    const done = await screen.findByText('3 letters marked printed.')
    await waitFor(() => expect(document.activeElement).toBe(done))
  })

  it('p with nothing selected says what to do, and sends nothing', async () => {
    const marked = serveQueue()
    const user = userEvent.setup()
    show()
    await screen.findByText(/letter 3/)
    rows()[0].focus()
    await user.keyboard('p')
    expect(screen.getByRole('status').textContent).toMatch(/Nothing is selected/)
    expect(marked).toHaveLength(0)
    await user.keyboard('?')
    expect(screen.getByRole('status').textContent).toMatch(/Space select, a select all, Enter open, p mark printed/)
    await user.keyboard('?')
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('asks before marking held letters printed, with focus on the question', async () => {
    const marked = serveQueue()
    const user = userEvent.setup()
    show('?tab=print&filter=held')
    await screen.findByText(/letter 4/)
    rows()[0].focus()
    await user.keyboard(' p')
    const yes = await screen.findByRole('button', { name: 'Yes, print anyway' })
    expect(marked).toHaveLength(0)
    await waitFor(() => expect(document.activeElement).toBe(yes))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(marked).toHaveLength(1))
    expect(marked[0].body).toEqual({ ids: [4], status: 'printed', release: true })
  })

  it('opens the focused letter with Enter', async () => {
    serveQueue()
    const user = userEvent.setup()
    const view = show()
    await screen.findByText(/letter 3/)
    rows()[1].focus()
    await user.keyboard('{Enter}')
    expect(view.location().pathname).toBe('/letters/2/print')
  })

  it('leaves the keys alone in a checkbox and in the decline form', async () => {
    serveQueue()
    const user = userEvent.setup()
    show()
    await screen.findByText(/letter 3/)
    const box = screen.getByRole('checkbox', { name: 'Select letter 1' })
    box.focus()
    await user.keyboard('j')
    expect(document.activeElement).toBe(box)
    // Space is the checkbox's own: one toggle, not two.
    await user.keyboard(' ')
    expect(screen.getByText('1 selected')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Don’t send' }))
    const field = screen.getAllByRole('textbox')[0]
    await user.click(field)
    await user.keyboard('a p')
    expect(screen.getByText('1 selected')).toBeTruthy()
  })
})
