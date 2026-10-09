import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { fakeApi } from '../../test/fakeApi'
import { renderApp } from '../../test/render'
import PrintLetter from './PrintLetter'

// The print page's stylesheet applies only while it is open: the body class and
// the `@page` margins it adds go when it unmounts, so no other page prints with them.

const letter = {
  id: 5,
  chat: 3,
  sender: 'user',
  status: 'queued',
  heldReason: null,
  paper: false,
  relayChapter: 10,
  prisoner_details: null,
  user_details: null,
  status_history: [],
  footer: null,
  replyReference: null,
  createdAt: '2026-10-07T12:00:00.000Z',
  updatedAt: '2026-10-07T12:00:00.000Z',
}

const marginSheets = () => [...document.head.querySelectorAll('style')].filter((s) => s.textContent.includes('@page'))

describe('PrintLetter', () => {
  it('adds the print class and margins while open, and removes both on leaving', async () => {
    fakeApi.on('GET', '/chapter/chapter', { id: 10, name: 'Test Group', accountStatus: 'active', ownerId: 1 })
    fakeApi.on('GET', '/messaging/message', letter, { params: { id: '5', full: 'true' } })
    // A group without a key yet: the letter loads, and nothing is decrypted.
    const view = renderApp(
      <Routes>
        <Route path="/letters/:id/print" element={<PrintLetter />} />
      </Routes>,
      { at: '/letters/5/print', session: { role: 'chapter', groupKey: 'none' } },
    )
    expect(document.body.classList.contains('printing-letter')).toBe(true)
    expect(marginSheets()).toHaveLength(1)
    expect(await screen.findByRole('heading', { name: 'Letter to a prisoner not in the directory' })).toBeTruthy()

    view.unmount()
    expect(document.body.classList.contains('printing-letter')).toBe(false)
    expect(marginSheets()).toEqual([])
  })
})
