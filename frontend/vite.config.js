import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  // ── Test configuration (Vitest 1.6, jsdom 24, Node 22.x) ──────────────────
  // Verified passing on Node 22.x (LTS).  The setup file handles the
  // Request / AbortSignal compatibility shim for Node 18+ environments.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
    // Expose the jsdom window globals (fetch, Request, Headers, …) so that
    // the compatibility shim in setup.js can read them before tests run.
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
  },
})
