import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// admin.css is not imported here: it sets global html/body/a rules that would
// restyle the public site. AdminLayout loads it only while an admin page is open.
import './assets/styles/style.css'
import './assets/styles/inbox.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
