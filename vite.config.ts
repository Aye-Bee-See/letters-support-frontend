/// <reference types="vitest/config" />
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
  build: {
    // libsodium (the sumo build, 534 kB) is the one chunk over Vite's 500 kB
    // default; it is loaded on demand, never on the front page.
    chunkSizeWarningLimit: 600,
  },
  test: {
    // The app's own tests only, never an agent worktree under .claude/.
    dir: 'src',
    // Two kinds, one run: pure modules in Node (*.test.ts), components and hooks
    // in happy-dom (*.test.tsx), with the API faked (src/test/setup.ts).
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
})
