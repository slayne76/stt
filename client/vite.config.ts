import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Never add `host: true` / `--host` here: it would make this dev
    // server LAN-reachable, and its /api proxy would forward straight
    // into the loopback-only backend (see "Server bound to 127.0.0.1"
    // in docs/PROJECT_STATE.md), undoing that hardening without
    // touching server/src/index.ts at all.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
