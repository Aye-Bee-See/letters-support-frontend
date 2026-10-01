import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  cacheDir: '.vite',
  server: {
    host: '0.0.0.0',
    // Matches the backend's default CORS_ORIGIN (http://localhost:3001)
    port: 3001,
    strictPort: true,
  },
})

