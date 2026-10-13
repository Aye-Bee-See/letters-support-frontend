import { useRef, type KeyboardEvent, type ReactNode } from 'react'

// A row of tabs over one panel, as the ARIA tabs pattern has it: the tabs
// name the panels they control, only the selected tab is in the Tab order
// (Tab moves into the row and on into the panel), and Left/Right/Home/End move
// between tabs, selecting as they go. Which tab is selected is the caller's
// (the group inbox keeps it in ?tab=). Every panel is in the document, so each
// tab's aria-controls names one; only the selected one has content. Styled
// by pages/group-inbox.css, the one page with tabs.

export interface TabDef<K extends string> {
  key: K
  label: string
}

interface Props<K extends string> {
  tabs: readonly TabDef<K>[]
  selected: K
  onSelect: (key: K) => void
  /** What the row of tabs is, for screen readers. */
  label: string
  /** Makes the tabs' and panels' ids: `${idPrefix}-tab-${key}`, `${idPrefix}-panel-${key}`. */
  idPrefix: string
  /** The selected tab's panel. */
  children: ReactNode
}

export default function Tabs<K extends string>({ tabs, selected, onSelect, label, idPrefix, children }: Props<K>) {
  const buttons = useRef(new Map<K, HTMLButtonElement>())
  const tabId = (key: K) => `${idPrefix}-tab-${key}`
  const panelId = (key: K) => `${idPrefix}-panel-${key}`

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // From the focused tab, not `selected`: the router renders a new ?tab= in a
    // transition, so a second key pressed quickly can come before it shows.
    const focused = tabs.findIndex((t) => buttons.current.get(t.key) === e.target)
    const at = focused >= 0 ? focused : tabs.findIndex((t) => t.key === selected)
    const to =
      e.key === 'ArrowRight' ? (at + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (at - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : null
    if (to === null) return
    e.preventDefault()
    const key = tabs[to].key
    if (to !== at) onSelect(key)
    buttons.current.get(key)?.focus()
  }

  return (
    <>
      <div className="group-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              if (el) buttons.current.set(t.key, el)
              else buttons.current.delete(t.key)
            }}
            type="button"
            role="tab"
            id={tabId(t.key)}
            aria-selected={t.key === selected}
            aria-controls={panelId(t.key)}
            tabIndex={t.key === selected ? 0 : -1}
            className={t.key === selected ? 'group-tab active' : 'group-tab'}
            onClick={() => onSelect(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={panelId(t.key)} aria-labelledby={tabId(t.key)} hidden={t.key !== selected}>
          {t.key === selected && children}
        </div>
      ))}
    </>
  )
}
