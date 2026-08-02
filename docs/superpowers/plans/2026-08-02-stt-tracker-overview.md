# STT Tracker — Overview Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the STT Tracker monorepo (Express backend + React/Vite frontend) with a working "Overview" page that shows the player's identity (Player ID, DBID) in an MUI table, sourced from a locally-cached copy of the game's `/player` API response.

**Architecture:** npm workspaces monorepo with `server/` (Node 24 + TypeScript + Express) proxying and disk-caching the upstream STT API call, and `client/` (Vite 8 + React 19 + TypeScript + MUI + React Router) consuming it through a dev-server proxy at `/api/*` — no CORS involved since the browser only ever talks to `localhost:5173`.

**Tech Stack:** Node 24, TypeScript (strict), Express, dotenv, native `fetch`; Vite 8, React 19, MUI (`@mui/material`, free components only), `react-router-dom`; ESLint flat config in both workspaces; `concurrently` to run both dev servers from the root.

## Global Constraints

- Node 24, React 19, Vite 8, TypeScript, MUI free components only, ESLint — per spec's stated stack.
- npm workspaces: root `package.json` with `workspaces: ["server", "client"]` — per spec's architecture.
- TypeScript strict mode in both workspaces — per spec's Tooling section.
- No test framework/automated tests in this slice — per spec's Non-goals; deliverables are verified via type-check, lint, and manual curl/browser checks instead.
- Session cookie lives in `server/.env` (gitignored) as `STT_SESSION_COOKIE`; `.env.example` is committed with placeholders — per spec's Backend Config section.
- Backend caches the raw player JSON to `server/data/player-cache.json` (gitignored) — per spec's Cache section.
- Upstream auth failures (`401`/`403`) surface as HTTP `502` with `{ error, code: "UPSTREAM_AUTH_FAILED" }`; any other upstream/network failure surfaces as HTTP `502` with `code: "UPSTREAM_ERROR"` — per spec's Error handling section.
- Never commit real session cookie values — only placeholders in `.env.example`.

---

### Task 1: Root & workspace scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore` (root)
- Create: `server/package.json`
- Create: `client/package.json`

**Interfaces:**
- Produces: root scripts `dev`, `lint`, `build` (delegating to workspaces via `-w server` / `-w client`) that later tasks' scripts must match by name (`dev`, `lint`, `build` in each workspace's own `package.json`).
- Produces: workspace names `stt-tracker-server` and `stt-tracker-client`, referenced nowhere else directly (npm resolves by folder), but useful for `npm ls --workspaces` sanity checks.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "stt-tracker",
  "private": true,
  "version": "0.1.0",
  "workspaces": [
    "server",
    "client"
  ],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm run dev -w server\" \"npm run dev -w client\"",
    "lint": "npm run lint -w server && npm run lint -w client",
    "build": "npm run build -w server && npm run build -w client"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

- [ ] **Step 2: Create root `.gitignore`**

```
node_modules/
dist/
.env
server/data/
```

- [ ] **Step 3: Create `server/package.json` (minimal stub, expanded in Task 2)**

```json
{
  "name": "stt-tracker-server",
  "version": "0.1.0",
  "private": true
}
```

- [ ] **Step 4: Create `client/package.json` (minimal stub, expanded in Task 4)**

```json
{
  "name": "stt-tracker-client",
  "version": "0.1.0",
  "private": true
}
```

- [ ] **Step 5: Install and verify workspace linking**

Run: `npm install` (from repo root)
Expected: exits 0. Then run `ls node_modules | grep stt-tracker` — expect to see `stt-tracker-server` and `stt-tracker-client` listed (npm symlinks workspace packages into root `node_modules`).

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore server/package.json client/package.json package-lock.json
git commit -m "Scaffold npm workspaces monorepo (server + client)"
```

---

### Task 2: Server bootstrap (Express + config + health endpoint)

**Files:**
- Modify: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/eslint.config.js`
- Create: `server/.env.example`
- Create: `server/src/config.ts`
- Create: `server/src/index.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `AppConfig` interface (`{ port: number; sttSessionCookie: string; sttClientApi: string }`) and `loadConfig(): AppConfig` from `server/src/config.ts` — Task 3 imports both.
- Produces: `server/src/index.ts` as the Express app entrypoint, with `app` (Express instance) and `config` in module scope — Task 3 modifies this file to mount its router via `app.use('/api', createPlayerRouter(config))`.

- [ ] **Step 1: Add dependencies and scripts to `server/package.json`**

```json
{
  "name": "stt-tracker-server",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "lint": "eslint ."
  },
  "dependencies": {
    "dotenv": "^16.4.0",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "eslint": "^9.15.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.15.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2023"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `server/eslint.config.js`**

```js
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  }
);
```

- [ ] **Step 4: Create `server/.env.example`**

```
# Value of the `_startrek_session` cookie from a logged-in browser session.
# Retrieve manually for now (DevTools > Application > Cookies) until
# automatic login is implemented.
STT_SESSION_COOKIE=replace_with_real_session_cookie_value

# STT client API version query param (see the game's network requests).
STT_CLIENT_API=33

# Port the local Express server listens on.
PORT=3001
```

- [ ] **Step 5: Create `server/src/config.ts`**

```ts
import 'dotenv/config';

export interface AppConfig {
  port: number;
  sttSessionCookie: string;
  sttClientApi: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? '3001'),
    sttSessionCookie: process.env.STT_SESSION_COOKIE ?? '',
    sttClientApi: process.env.STT_CLIENT_API ?? '33',
  };
}
```

- [ ] **Step 6: Create `server/src/index.ts`**

```ts
import express from 'express';
import { loadConfig } from './config';

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(config.port, () => {
  console.log(`STT tracker server listening on port ${config.port}`);
});
```

- [ ] **Step 7: Install and verify the server starts**

Run: `npm install` (repo root, picks up new server deps)
Expected: exits 0.

Run: `npm run dev -w server` in the background, then `curl -s http://localhost:3001/health`
Expected: `{"status":"ok"}`. Stop the dev server afterward.

- [ ] **Step 8: Lint check**

Run: `npm run lint -w server`
Expected: exits 0, no errors.

- [ ] **Step 9: Commit**

```bash
git add server/package.json server/tsconfig.json server/eslint.config.js server/.env.example server/src/config.ts server/src/index.ts package-lock.json
git commit -m "Add Express server bootstrap with health endpoint and env config"
```

---

### Task 3: Server player data pipeline (cache + upstream client + routes)

**Files:**
- Create: `server/src/errors.ts`
- Create: `server/src/cache.ts`
- Create: `server/src/sttClient.ts`
- Create: `server/src/routes/player.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `AppConfig` and `loadConfig` from `server/src/config.ts` (Task 2).
- Consumes: `app` (Express instance) and `config` from `server/src/index.ts` (Task 2) — this task adds a mount line to that file.
- Produces: `readPlayerCache(): unknown | null` and `writePlayerCache(data: unknown): void` from `server/src/cache.ts`.
- Produces: `fetchPlayerData(config: AppConfig): Promise<unknown>` from `server/src/sttClient.ts`, throwing `UpstreamAuthError` or `UpstreamError` (from `server/src/errors.ts`) on failure.
- Produces: `createPlayerRouter(config: AppConfig): Router` from `server/src/routes/player.ts`, mounted at `/api` — exposes `GET /api/player` and `POST /api/player/refresh`. The client (Task 6) depends on these exact paths and the `{ error: string, code: 'UPSTREAM_AUTH_FAILED' | 'UPSTREAM_ERROR' }` error body shape.

- [ ] **Step 1: Create `server/src/errors.ts`**

```ts
export class UpstreamAuthError extends Error {}
export class UpstreamError extends Error {}
```

- [ ] **Step 2: Create `server/src/cache.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const CACHE_PATH = 'data/player-cache.json';

export function readPlayerCache(): unknown | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  const raw = readFileSync(CACHE_PATH, 'utf-8');
  return JSON.parse(raw);
}

export function writePlayerCache(data: unknown): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
```

`CACHE_PATH` is relative to the server workspace's working directory — `npm run dev -w server` and `npm start` both run with `cwd` set to `server/`, so this resolves to `server/data/player-cache.json`, which the root `.gitignore`'s `server/data/` entry already covers.

- [ ] **Step 3: Create `server/src/sttClient.ts`**

```ts
import type { AppConfig } from './config';
import { UpstreamAuthError, UpstreamError } from './errors';

export async function fetchPlayerData(config: AppConfig): Promise<unknown> {
  if (!config.sttSessionCookie) {
    throw new UpstreamAuthError('STT_SESSION_COOKIE is not set in server/.env');
  }

  const url = `https://app.startrektimelines.com/player?client_api=${config.sttClientApi}&only_read_state=true`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Cookie: `_startrek_session=${config.sttSessionCookie}`,
        Accept: 'application/json',
      },
    });
  } catch (cause) {
    throw new UpstreamError(`Network error contacting STT API: ${(cause as Error).message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new UpstreamAuthError(
      `STT API rejected the session cookie (HTTP ${response.status}). It has likely expired — update STT_SESSION_COOKIE in server/.env.`
    );
  }

  if (!response.ok) {
    throw new UpstreamError(`STT API returned HTTP ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 4: Create `server/src/routes/player.ts`**

```ts
import { Router, type Response } from 'express';
import type { AppConfig } from '../config';
import { fetchPlayerData } from '../sttClient';
import { readPlayerCache, writePlayerCache } from '../cache';
import { UpstreamAuthError, UpstreamError } from '../errors';

export function createPlayerRouter(config: AppConfig): Router {
  const router = Router();

  router.get('/player', async (_req, res) => {
    const cached = readPlayerCache();
    if (cached !== null) {
      res.json(cached);
      return;
    }
    await refreshAndRespond(config, res);
  });

  router.post('/player/refresh', async (_req, res) => {
    await refreshAndRespond(config, res);
  });

  return router;
}

async function refreshAndRespond(config: AppConfig, res: Response): Promise<void> {
  try {
    const data = await fetchPlayerData(config);
    writePlayerCache(data);
    res.json(data);
  } catch (err) {
    if (err instanceof UpstreamAuthError) {
      res.status(502).json({ error: err.message, code: 'UPSTREAM_AUTH_FAILED' });
      return;
    }
    if (err instanceof UpstreamError) {
      res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
      return;
    }
    res.status(502).json({ error: 'Unexpected error fetching player data', code: 'UPSTREAM_ERROR' });
  }
}
```

- [ ] **Step 5: Mount the router in `server/src/index.ts`**

Replace the file's contents with:

```ts
import express from 'express';
import { loadConfig } from './config';
import { createPlayerRouter } from './routes/player';

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createPlayerRouter(config));

app.listen(config.port, () => {
  console.log(`STT tracker server listening on port ${config.port}`);
});
```

- [ ] **Step 6: Verify the deterministic auth-error path (no real cookie needed)**

Make sure `server/.env` does not exist yet (or exists without `STT_SESSION_COOKIE` set).

Run: `npm run dev -w server` in the background, then `curl -s -i http://localhost:3001/api/player`
Expected: `HTTP/1.1 502`, JSON body `{"error":"STT_SESSION_COOKIE is not set in server/.env","code":"UPSTREAM_AUTH_FAILED"}`. This confirms the error-handling path end-to-end without needing network access or a real game session. Stop the dev server afterward.

- [ ] **Step 7: Lint check**

Run: `npm run lint -w server`
Expected: exits 0, no errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/errors.ts server/src/cache.ts server/src/sttClient.ts server/src/routes/player.ts server/src/index.ts
git commit -m "Add player data pipeline: disk cache, upstream client, API routes"
```

**Manual follow-up (not part of this task, requires your real credentials):** once you copy `server/.env.example` to `server/.env` and fill in a real `STT_SESSION_COOKIE`, re-run `curl -s http://localhost:3001/api/player` — it should return the live player JSON instead of the 502 error, and a second call should return the cached copy instantly (delete `server/data/player-cache.json` to force a fresh fetch, or use `curl -X POST http://localhost:3001/api/player/refresh`).

---

### Task 4: Client bootstrap (Vite + React + TS + MUI, dev proxy)

**Files:**
- Modify: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/tsconfig.app.json`
- Create: `client/tsconfig.node.json`
- Create: `client/vite.config.ts`
- Create: `client/eslint.config.js`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (client and server are independent workspaces).
- Produces: `App` default export from `client/src/App.tsx` — Task 5 modifies this file to add routing.
- Produces: dev server proxy rule `/api/* → http://localhost:3001` in `client/vite.config.ts` — later tasks' `fetch('/api/...')` calls rely on this.

- [ ] **Step 1: Add dependencies and scripts to `client/package.json`**

```json
{
  "name": "stt-tracker-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "@mui/material": "^6.1.0",
    "@mui/icons-material": "^6.1.0",
    "@emotion/react": "^11.13.0",
    "@emotion/styled": "^11.13.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.15.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "eslint": "^9.15.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.0",
    "globals": "^15.11.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.15.0",
    "vite": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create `client/tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 3: Create `client/tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `client/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create `client/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 6: Create `client/eslint.config.js`**

```js
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  }
);
```

- [ ] **Step 7: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>STT Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `client/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 9: Create `client/src/App.tsx` (placeholder, expanded in Task 5)**

```tsx
function App() {
  return <div>STT Tracker</div>;
}

export default App;
```

- [ ] **Step 10: Install and verify build**

Run: `npm install` (repo root, picks up new client deps)
Expected: exits 0.

Run: `npm run build -w client`
Expected: exits 0 (type-checks via `tsc -b` then builds via `vite build`).

- [ ] **Step 11: Lint check**

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 12: Verify dev server serves HTML**

Run: `npm run dev -w client` in the background, then `curl -s http://localhost:5173 | grep 'id="root"'`
Expected: a matching line is printed (confirms the dev server serves the app shell). Stop the dev server afterward.

- [ ] **Step 13: Commit**

```bash
git add client/package.json client/tsconfig.json client/tsconfig.app.json client/tsconfig.node.json client/vite.config.ts client/eslint.config.js client/index.html client/src/main.tsx client/src/App.tsx package-lock.json
git commit -m "Scaffold Vite + React 19 + TypeScript + MUI client with dev API proxy"
```

---

### Task 5: Layout shell and routing

**Files:**
- Create: `client/src/layout/AppLayout.tsx`
- Create: `client/src/pages/OverviewPage.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `App` shell from `client/src/App.tsx` (Task 4) — replaced with routed content.
- Produces: `AppLayout` default export (MUI `AppBar` + `Drawer` wrapping `<Outlet />`) — later sections' pages will be added as sibling `<Route>` entries under the same `AppLayout` element.
- Produces: `OverviewPage` default export at route path `/` — Task 7 modifies this file to render the real table.

- [ ] **Step 1: Create `client/src/layout/AppLayout.tsx`**

```tsx
import { AppBar, Box, Drawer, List, ListItemButton, ListItemText, Toolbar, Typography } from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';

const DRAWER_WIDTH = 220;

const NAV_ITEMS = [{ label: 'Overview', path: '/' }];

function AppLayout() {
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            STT Tracker
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <List>
          {NAV_ITEMS.map((item) => (
            <ListItemButton key={item.path} onClick={() => navigate(item.path)}>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}

export default AppLayout;
```

- [ ] **Step 2: Create `client/src/pages/OverviewPage.tsx` (placeholder, expanded in Task 7)**

```tsx
import { Typography } from '@mui/material';

function OverviewPage() {
  return <Typography variant="h4">Overview</Typography>;
}

export default OverviewPage;
```

- [ ] **Step 3: Replace `client/src/App.tsx` with routing**

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import OverviewPage from './pages/OverviewPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<OverviewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 5: Manual visual check**

Run: `npm run dev -w client` in the background, then open `http://localhost:5173` in a browser.
Expected: a blue top `AppBar` reading "STT Tracker", a left sidebar `Drawer` with an "Overview" item, and an "Overview" heading in the main content area. Stop the dev server afterward.

- [ ] **Step 6: Commit**

```bash
git add client/src/layout/AppLayout.tsx client/src/pages/OverviewPage.tsx client/src/App.tsx
git commit -m "Add MUI app layout shell and Overview route"
```

---

### Task 6: Client data layer (types, API client, hook)

**Files:**
- Create: `client/src/types/player.ts`
- Create: `client/src/api/playerApi.ts`
- Create: `client/src/lib/extractPlayerIdentity.ts`
- Create: `client/src/hooks/usePlayerData.ts`

**Interfaces:**
- Consumes: backend endpoints `GET /api/player` and `POST /api/player/refresh` (Task 3), proxied by Vite (Task 4). Consumes the error body shape `{ error: string, code: 'UPSTREAM_AUTH_FAILED' | 'UPSTREAM_ERROR' }`.
- Produces: `PlayerData` type (`Record<string, unknown>`) and `PlayerIdentity` interface (`{ playerId: number | string | null; dbid: number | string | null }`) from `client/src/types/player.ts`.
- Produces: `fetchPlayer(): Promise<PlayerData>`, `refreshPlayer(): Promise<PlayerData>`, `PlayerApiError` class from `client/src/api/playerApi.ts`.
- Produces: `extractPlayerIdentity(data: PlayerData): PlayerIdentity` from `client/src/lib/extractPlayerIdentity.ts`.
- Produces: `usePlayerData(): { data: PlayerData | null; loading: boolean; error: string | null; refresh: () => Promise<void> }` from `client/src/hooks/usePlayerData.ts` — Task 7's `OverviewPage` consumes this hook directly.

- [ ] **Step 1: Create `client/src/types/player.ts`**

```ts
export interface PlayerIdentity {
  playerId: number | string | null;
  dbid: number | string | null;
}

export type PlayerData = Record<string, unknown>;
```

- [ ] **Step 2: Create `client/src/lib/extractPlayerIdentity.ts`**

```ts
import type { PlayerData, PlayerIdentity } from '../types/player';

// STT's /player payload nests the player record under `player`; exact field
// names are confirmed against the live response, not guessed here.
export function extractPlayerIdentity(data: PlayerData): PlayerIdentity {
  const player = (data.player ?? {}) as Record<string, unknown>;
  const dbid = player.dbid;
  const id = player.id ?? dbid;

  return {
    playerId: isDisplayable(id) ? id : null,
    dbid: isDisplayable(dbid) ? dbid : null,
  };
}

function isDisplayable(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}
```

- [ ] **Step 3: Create `client/src/api/playerApi.ts`**

```ts
import type { PlayerData } from '../types/player';

export interface ApiErrorBody {
  error: string;
  code: 'UPSTREAM_AUTH_FAILED' | 'UPSTREAM_ERROR';
}

export class PlayerApiError extends Error {
  code: ApiErrorBody['code'];

  constructor(body: ApiErrorBody) {
    super(body.error);
    this.code = body.code;
  }
}

async function parsePlayerResponse(response: Response): Promise<PlayerData> {
  const body = await response.json();
  if (!response.ok) {
    throw new PlayerApiError(body as ApiErrorBody);
  }
  return body as PlayerData;
}

export async function fetchPlayer(): Promise<PlayerData> {
  const response = await fetch('/api/player');
  return parsePlayerResponse(response);
}

export async function refreshPlayer(): Promise<PlayerData> {
  const response = await fetch('/api/player/refresh', { method: 'POST' });
  return parsePlayerResponse(response);
}
```

- [ ] **Step 4: Create `client/src/hooks/usePlayerData.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import type { PlayerData } from '../types/player';
import { fetchPlayer, refreshPlayer, PlayerApiError } from '../api/playerApi';

export interface UsePlayerDataResult {
  data: PlayerData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePlayerData(): UsePlayerDataResult {
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fetcher: () => Promise<PlayerData>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof PlayerApiError ? err.message : 'Failed to load player data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fetchPlayer);
  }, [load]);

  const refresh = useCallback(() => load(refreshPlayer), [load]);

  return { data, loading, error, refresh };
}
```

- [ ] **Step 5: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0 (confirms all the new types compile together correctly).

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/types/player.ts client/src/lib/extractPlayerIdentity.ts client/src/api/playerApi.ts client/src/hooks/usePlayerData.ts
git commit -m "Add client player data layer: API client, identity extraction, hook"
```

---

### Task 7: Overview page (MUI table wired to live data)

**Files:**
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:**
- Consumes: `usePlayerData()` from `client/src/hooks/usePlayerData.ts` (Task 6), `extractPlayerIdentity` from `client/src/lib/extractPlayerIdentity.ts` (Task 6).

- [ ] **Step 1: Replace `client/src/pages/OverviewPage.tsx` with the real implementation**

```tsx
import {
  Alert,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';

const FIELD_LABELS: Record<string, string> = {
  playerId: 'Player ID',
  dbid: 'DBID',
};

function OverviewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h4">Overview</Typography>
        <Button variant="contained" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && data && (
        <TableContainer component={Paper}>
          <Table>
            <TableBody>
              {Object.entries(extractPlayerIdentity(data)).map(([field, value]) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {FIELD_LABELS[field]}
                  </TableCell>
                  <TableCell align="right">{value ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

export default OverviewPage;
```

- [ ] **Step 2: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 3: Manual verification of the deterministic error path**

With `server/.env` still missing `STT_SESSION_COOKIE` (or the file absent):

Run: `npm run dev -w server` in the background and `npm run dev -w client` in the background. Open `http://localhost:5173`.
Expected: a red MUI `Alert` reading "STT_SESSION_COOKIE is not set in server/.env" appears instead of the table (confirms the full request/response/error-display chain works without needing real credentials). Click "Refresh" — same alert reappears. Stop both dev servers afterward.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/OverviewPage.tsx
git commit -m "Implement Overview page: MUI table of player identity fields"
```

**Manual follow-up (requires your real credentials, not part of this task):** fill in a real `STT_SESSION_COOKIE` in `server/.env`, restart the server, reload the page, and confirm the table renders actual `Player ID` / `DBID` values instead of the error alert. If the field names don't match what's rendered (the exact payload shape wasn't guessed blind — see the spec's open questions), adjust `extractPlayerIdentity` in `client/src/lib/extractPlayerIdentity.ts` to match the real response.

---

### Task 8: Root dev workflow and README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: root `npm run dev` script (Task 1), server `/health` and `/api/player` endpoints (Tasks 2–3), client dev server (Task 4).

- [ ] **Step 1: Replace `README.md` contents**

```markdown
# STT Tracker

Local tool for tracking data and statistics for Star Trek Timelines.

## Setup

1. `npm install` (root — installs both workspaces)
2. Copy `server/.env.example` to `server/.env` and fill in `STT_SESSION_COOKIE`
   with the value of your `_startrek_session` cookie (from browser DevTools
   while logged into the game).
3. `npm run dev` (root — starts the API server on :3001 and the Vite dev
   server on :5173 together)
4. Open http://localhost:5173

## Refreshing the session cookie

The cookie expires periodically. When the Overview page shows an
"UPSTREAM_AUTH_FAILED" error, grab a fresh `_startrek_session` value and
update `server/.env`, then restart the server (or hit Refresh once the new
value is in place).
```

- [ ] **Step 2: Full workspace build and lint**

Run: `npm run build` (root)
Expected: exits 0 (builds both server and client).

Run: `npm run lint` (root)
Expected: exits 0 (lints both server and client).

- [ ] **Step 3: End-to-end dev workflow check**

Run: `npm run dev` (root) in the background.
Run: `curl -s http://localhost:3001/health` — expect `{"status":"ok"}`.
Run: `curl -s http://localhost:5173 | grep 'id="root"'` — expect a matching line.
Stop the background process afterward.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Add root dev workflow docs"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, run `npm run dev` from the root and confirm in the browser that the Overview page shows your actual Player ID and DBID.
