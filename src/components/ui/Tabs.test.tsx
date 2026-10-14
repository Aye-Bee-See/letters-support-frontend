import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useSearchParams } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/render'
import Tabs from './Tabs'

// The group inbox's tabs: ARIA tabs with their panels, one Tab stop, the
// arrow keys, Home and End, and the selected tab kept in ?tab= as the inbox
// keeps it.

const TABS = [
  { key: 'print', label: 'To print' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'writers', label: 'Writers' },
] as const
type Key = (typeof TABS)[number]['key']

function Page() {
  const [params, setParams] = useSearchParams()
  const tab: Key = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'print'
  return (
    <>
      <Tabs tabs={TABS} selected={tab} onSelect={(key) => setParams({ tab: key })} label="Group inbox" idPrefix="inbox">
        <p>panel: {tab}</p>
      </Tabs>
      <button type="button">After</button>
    </>
  )
}

const visit = (at = '/inbox') =>
  renderApp(
    <Routes>
      <Route path="/inbox" element={<Page />} />
    </Routes>,
    { at },
  )

describe('Tabs', () => {
  it('ties each tab to its panel, with only the selected one in the Tab order', () => {
    visit('/inbox?tab=conversations')
    expect(screen.getByRole('tablist', { name: 'Group inbox' })).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => [t.textContent, t.getAttribute('aria-selected'), t.tabIndex])).toEqual([
      ['To print', 'false', -1],
      ['Conversations', 'true', 0],
      ['Writers', 'false', -1],
    ])
    for (const t of tabs) expect(document.getElementById(t.getAttribute('aria-controls') ?? '')?.getAttribute('role')).toBe('tabpanel')

    const panel = screen.getByRole('tabpanel', { name: 'Conversations' })
    expect(panel.textContent).toBe('panel: conversations')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1) // the others are hidden
  })

  it('moves with the arrow keys, Home and End, and keeps the tab in the URL', async () => {
    const view = visit()
    const user = userEvent.setup()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'To print' }))

    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Conversations', selected: true }))
    expect(view.location().search).toBe('?tab=conversations')
    expect(screen.getByRole('tabpanel', { name: 'Conversations' }).textContent).toBe('panel: conversations')

    await user.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Writers', selected: true }))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'To print', selected: true }))
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Writers', selected: true }))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'To print', selected: true }))
    expect(view.location().search).toBe('?tab=print')

    // One Tab stop: Tab leaves the row for what follows.
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After' }))
  })

  it('moves from the focused tab when the selection is slow to show', async () => {
    // The router renders a new ?tab= in a transition; here the selection never changes.
    const onSelect = vi.fn()
    render(
      <Tabs tabs={TABS} selected="print" onSelect={onSelect} label="Group inbox" idPrefix="inbox">
        <p>panel</p>
      </Tabs>,
    )
    const user = userEvent.setup()
    await user.tab()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Writers' }))
    expect(onSelect.mock.calls).toEqual([['conversations'], ['writers']])
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Conversations' }))
    expect(onSelect).toHaveBeenLastCalledWith('conversations')
  })

  it('selects on a click', async () => {
    const view = visit()
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Writers' }))
    expect(view.location().search).toBe('?tab=writers')
    expect(screen.getByRole('tabpanel', { name: 'Writers' }).textContent).toBe('panel: writers')
  })
})
