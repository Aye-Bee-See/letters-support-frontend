import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Message } from '../../types'
import { fakeApi, reply, type FakeRequest } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import MarkLetter from './MarkLetter'

// A held letter is printed only after "Yes, print anyway". Once it is, the
// question must close: the letter's next step is "Mark mailed", and the box
// must not stay up offering to release it a second time. The API is faked.

const held = {
  id: 7,
  chat: 7,
  status: 'queued',
  heldReason: 'prisoner_free',
  paper: false,
  relayChapter: 10,
  createdAt: '2026-10-15T12:00:00.000Z',
  updatedAt: '2026-10-15T12:00:00.000Z',
} as unknown as Message

/** The thread's side of it: the letter's status moves on when the mark succeeds. */
function Host() {
  const [message, setMessage] = useState(held)
  const [notice, setNotice] = useState('')
  return (
    <>
      <MarkLetter
        message={message}
        canPrint
        onDone={(text) => {
          setNotice(text)
          setMessage((m) => ({ ...m, status: 'printed', heldReason: null }))
        }}
      />
      <p>{notice}</p>
    </>
  )
}

describe('MarkLetter on a held letter', () => {
  it('closes the question once the letter is printed', async () => {
    const marks: FakeRequest[] = []
    fakeApi.on('PUT', '/messaging/status', (r: FakeRequest) => {
      marks.push(r)
      return reply.ok({ id: 7, status: (r.body as { status: string }).status })
    })
    const user = userEvent.setup()
    renderApp(<Host />, { session: { role: 'chapter', groupKey: 'held' } })

    await user.click(screen.getByRole('button', { name: 'Mark printed' }))
    expect(screen.getByText('Print it anyway? Only do this if you know it can still reach the person.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Yes, print anyway' }))

    expect(marks).toHaveLength(1)
    expect(marks[0].body).toMatchObject({ status: 'printed', release: true })
    expect(await screen.findByRole('button', { name: 'Mark mailed' })).toBeTruthy()
    expect(screen.queryByText('Yes, print anyway')).toBeNull()
  })
})
