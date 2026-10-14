import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatCode } from '../../crypto'
import type { Invitation } from '../../types'
import { ADMIN_UI } from '../forms/uiClasses'
import TokenNotice from './TokenNotice'

// The token is shown once, and is a secret: the live region announces that an
// invitation was made, and the code and link sit outside it, in labelled groups.

const TOKEN = 'ABCD2345EFGH6789'

const invitation: Invitation = {
  id: 7,
  kind: 'group',
  chapterId: null,
  inviteeName: 'Riverside Books',
  inviteeEmail: null,
  note: null,
  expiresAt: '2026-10-20T12:00:00.000Z',
  status: 'pending',
  invitedBy: 1,
  acceptedAt: null,
  acceptedUser: null,
  createdChapter: null,
  createdAt: '2026-10-13T12:00:00.000Z',
  updatedAt: '2026-10-13T12:00:00.000Z',
  token: TOKEN,
}

describe('TokenNotice', () => {
  it('keeps the code and the link out of the live region', () => {
    render(<TokenNotice classes={ADMIN_UI} invitation={invitation} renewed={false} onDone={() => {}} />)
    const code = formatCode(TOKEN)

    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/Invitation created for Riverside Books to join the network; the code is below/)
    expect(status.textContent).not.toContain(code)
    expect(within(status).queryByRole('button')).toBeNull()

    const codeGroup = screen.getByRole('group', { name: 'Invitation code' })
    expect(codeGroup.textContent).toContain(code)
    expect(within(codeGroup).getByRole('button', { name: 'Copy code' })).toBeTruthy()
    const linkGroup = screen.getByRole('group', { name: 'Invitation link' })
    expect(linkGroup.textContent).toContain(`/invitation?token=${code}`)
    expect(within(linkGroup).getByRole('button', { name: 'Copy link' })).toBeTruthy()
  })
})
