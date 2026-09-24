import type { ReactNode } from 'react'

// The signed-in two-column layout from solidarity-site/inbox-writer.html:
// main content on the left, sidebar on the right. Each page supplies its own
// sidebar contents (new-letter button, relay group, account block, ...).
export default function AppShell({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  return (
    <div className="app-wrap">
      <div className="app-layout">
        <main className="app-main">{children}</main>
        {sidebar && <aside className="app-sidebar">{sidebar}</aside>}
      </div>
    </div>
  )
}
