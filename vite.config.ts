/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The Content-Security-Policy for a build that talks to the API at `apiUrl`:
 * scripts, fonts and workers from this site only (WebAssembly allowed, for
 * libsodium; a blob: worker allowed), styles too, and the two <style> elements
 * the app adds; requests to this site and the API;
 * images also from the API (prisoner and group photos), data: and blob: (the
 * opened attachments). A static host sends the whole of it as a header (README
 * "Running it"); the <meta> copy, for hosts that can't, leaves out
 * frame-ancestors, which a browser ignores there.
 */
export function contentSecurityPolicy(apiUrl: string, { meta = false } = {}): string {
  const api = new URL(apiUrl).origin
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    `connect-src 'self' ${api}`,
    `img-src 'self' data: blob: ${api}`,
    // 'unsafe-inline' for two <style> elements added at run time: admin.css,
    // which AdminLayout puts in while /admin is open, and PrintPageStyle's
    // @page margins (components/group/PrintSheet.tsx). No style attribute is left.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    ...(meta ? [] : ["frame-ancestors 'none'"]),
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

/**
 * The policy as a <meta http-equiv> in the built index.html, for the API the
 * build was made for (VITE_API_URL, as src/api/client.ts reads it). Not in the
 * dev server: its client injects inline scripts and styles.
 */
function contentSecurityPolicyMeta(): Plugin {
  let apiUrl = 'http://localhost:3069'
  return {
    name: 'content-security-policy',
    apply: 'build',
    configResolved(config) {
      const fromEnv = (config.env as Record<string, string | undefined>).VITE_API_URL
      if (fromEnv) apiUrl = fromEnv
    },
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(apiUrl, { meta: true }) }, injectTo: 'head-prepend' },
    ],
  }
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicyMeta()],
  cacheDir: '.vite',
  server: {
    host: '0.0.0.0',
    // Matches the backend's default CORS_ORIGIN (http://localhost:3001)
    port: 3001,
    strictPort: true,
    // Agent worktrees live under .claude/: a change there must not reload every
    // open page (a reload signs out, as sessions are memory-only).
    watch: { ignored: ['**/.claude/**'] },
  },
  build: {
    // libsodium (the sumo build, 534 kB) is the one chunk over Vite's 500 kB
    // default; it is loaded on demand, never on the front page.
    chunkSizeWarningLimit: 600,
  },
  test: {
    // The app's own tests only, never an agent worktree under .claude/.
    dir: 'src',
    // `npm run test:coverage`: a summary in the terminal, the full report under
    // node_modules/.coverage (open index.html). No threshold; nothing in CI reads it.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts', 'src/types/**'],
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'node_modules/.coverage',
    },
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
          // The dev server's origin, so links and window.location resolve as in the app.
          environmentOptions: { happyDOM: { url: 'http://localhost:3001/' } },
          include: ['**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
})
