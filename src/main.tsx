import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// admin.css is not imported here: it sets global html/body/a rules that would
// restyle the public site. AdminLayout loads it only while an admin page is open.
import './assets/styles/style.css'
import './assets/styles/inbox.css'
// Page-specific CSS from the prototype pages' <style> blocks. Imported here,
// after the shared files, so the cascade order is fixed. Imported from the page
// components instead, it would load on first visit and never unload, and the
// order would depend on which pages the user had seen.
import './assets/styles/pages/about.css'
import './assets/styles/pages/claim.css'
import './assets/styles/pages/create-writer.css'
import './assets/styles/pages/facility-profile.css'
import './assets/styles/pages/forgot-password.css'
import './assets/styles/pages/group-inbox.css'
import './assets/styles/pages/group-profile.css'
import './assets/styles/pages/handoff.css'
import './assets/styles/pages/login.css'
import './assets/styles/pages/new-letter.css'
import './assets/styles/pages/org-settings.css'
import './assets/styles/pages/prisoner-profile.css'
import './assets/styles/pages/thread.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
