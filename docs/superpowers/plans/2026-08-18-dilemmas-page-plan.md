# "Dilemmas" page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Dilemmas" page (last item in the top-level nav, after "Collections") that renders a static, hand-maintained JSON document of dilemma missions — their choices, which choices chain into follow-up dilemmas, and which grant crew rewards — in a table matching the app's existing table style.

**Architecture:** A static JSON file lives on the server (`server/src/data/dilemmas.json`, git-tracked, copied to `dist/` automatically via `resolveJsonModule`) and is served as-is by a new `GET /api/dilemmas` route (Task 1). The client fetches it through a new `DilemmasContext`/`useDilemmas` hook (mirroring the existing `CrewCatalogContext` pattern), resolves each reward's crew by `archetypeId` against the already-fetched crew catalog for portrait + name, and renders everything in a new `DilemmasTable` on a new `DilemmasPage` wired into the router and nav (Task 2).

**Tech Stack:** React 19 + TypeScript (strict) + MUI on the client, Node/Express + TypeScript on the server. No test framework — verification via `tsc --noEmit`, `curl`, and a real-browser check with the `playwright` npm library.

**Design reference:** `docs/superpowers/specs/2026-08-18-dilemmas-page-design.md` — read it if anything below is ambiguous; it also has the full seed-data table of names to `archetype_id`.

## Global Constraints

- Choice icon rule (`getChoiceIcon`): **check** if the choice has `leadsToDilemmaId` set **or** a non-empty `rewards` array (a reward counts as a positive outcome exactly like continuing the chain). Otherwise **x** if any *other* choice in the same dilemma has `leadsToDilemmaId` or `rewards` (the dilemma has *some* relation). Otherwise **circle** — the whole dilemma has zero reward and zero chain link on any choice.
- Reward column layout: one group per reward-bearing choice, laid out **side by side in the same flex row** (never stacked one under another) — only wraps to a second line if the column is too narrow to fit every group. Each reward crew icon uses `Thumbnail` with the catalog's `imageUrlPortrait`; the crew's name is shown underneath only when that specific `Reward.showName` is `true`.
- Drop Rate column: if every reward-bearing choice in the row shares the same `dropRatePercent`, show it once (`"100%"`); otherwise show one line per choice, letter-prefixed, matching the Reward column's groups (`"A: 100%"` / `"B: 2%"`). Within a single choice's `rewards` array, every entry always shares the same `dropRatePercent` — reading `rewards[0].dropRatePercent` for the whole choice is correct, not a shortcut.
- Chain grouping: dilemmas are sorted by `chainName` (alphabetical) then `partNumber` (ascending) before rendering — this single sort produces both the alphabetical ordering and chain-adjacency. The **last** row of each `chainName` group gets a `BLOCK_BOUNDARY_COLOR` bottom border (same divider idiom as `CollectionsTable.tsx`) to visually separate it from the next chain/standalone dilemma.
- No search bar, no pagination, no editing UI in this version (per spec's non-goals) — `DilemmasTable` renders the full list directly, no `usePagination`.
- Nav entry `{ label: 'Dilemmas', path: '/dilemmas', element: <DilemmasPage /> }` is a new **top-level** item (not nested in a group), appended immediately after the existing `Collections` entry in `NAV_ITEMS`.

---

### Task 1: Server — static data file and `/api/dilemmas` route

**Files:**
- Create: `server/src/data/dilemmas.json`
- Create: `server/src/dilemmasTypes.ts`
- Create: `server/src/routes/dilemmas.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces: `GET /api/dilemmas` → JSON body `{ dilemmas: Dilemma[] }`, shape defined in `server/src/dilemmasTypes.ts` (`Dilemma`, `Choice`, `Reward`, `DilemmasResponse`). Task 2's client-side types (`client/src/types/dilemma.ts`) must match this shape field-for-field — they are maintained separately (no shared package in this repo; see `CatalogEntry` for the existing precedent of the same type duplicated per side).

- [ ] **Step 1: Create the static seed data**

Create `server/src/data/dilemmas.json`:

```json
{
  "dilemmas": [
    {
      "id": "a-higher-duty-part-1",
      "name": "A Higher Duty, Part 1",
      "chainName": "A Higher Duty",
      "partNumber": 1,
      "choices": [
        { "letter": "A", "description": "Give a rousing speech in support of the diplomat.", "leadsToDilemmaId": "a-higher-duty-part-2" },
        { "letter": "B", "description": "Give a neutral speech to avoid sides.", "leadsToDilemmaId": "a-higher-duty-part-2" },
        { "letter": "C", "description": "Refuse to speak at the diplomat's gala." }
      ]
    },
    {
      "id": "a-higher-duty-part-2",
      "name": "A Higher Duty, Part 2",
      "chainName": "A Higher Duty",
      "partNumber": 2,
      "choices": [
        { "letter": "A", "description": "Suggest a lenient sentence in the hopes of reform." },
        { "letter": "B", "description": "Suggest a harsh sentence in light of the consequences of his theft.", "leadsToDilemmaId": "a-higher-duty-part-3" }
      ]
    },
    {
      "id": "a-higher-duty-part-3",
      "name": "A Higher Duty, Part 3",
      "chainName": "A Higher Duty",
      "partNumber": 3,
      "choices": [
        { "letter": "A", "description": "Disable his ship before he can harm the colony.", "rewards": [{ "crewArchetypeId": 6281, "dropRatePercent": 100, "showName": true }] },
        { "letter": "B", "description": "Talk him down before he or anyone else is hurt.", "rewards": [{ "crewArchetypeId": 5882, "dropRatePercent": 100, "showName": true }] }
      ]
    },
    {
      "id": "lost-among-the-stars",
      "name": "Lost Among the Stars",
      "chainName": "Lost Among the Stars",
      "partNumber": 1,
      "choices": [
        {
          "letter": "A",
          "description": "Search for the ship or any other survivors.",
          "rewards": [
            { "crewArchetypeId": 18157, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 21976, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 23481, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 24025, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 24853, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 26216, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 28013, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 29195, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 31199, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 31546, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 32154, "dropRatePercent": 2, "showName": false }
          ]
        },
        { "letter": "B", "description": "Tell the survivor I cannot take the risk." }
      ]
    }
  ]
}
```

- [ ] **Step 2: Create the server-side type definitions**

Create `server/src/dilemmasTypes.ts`:

```ts
export interface Reward {
  crewArchetypeId: number;
  dropRatePercent: number;
  showName: boolean;
}

export interface Choice {
  letter: 'A' | 'B' | 'C';
  description: string;
  leadsToDilemmaId?: string;
  rewards?: Reward[];
}

export interface Dilemma {
  id: string;
  name: string;
  chainName: string;
  partNumber: number;
  choices: Choice[];
}

export interface DilemmasResponse {
  dilemmas: Dilemma[];
}
```

- [ ] **Step 3: Create the route**

Create `server/src/routes/dilemmas.ts`:

```ts
import { Router } from 'express';
import dilemmasJson from '../data/dilemmas.json';
import type { DilemmasResponse } from '../dilemmasTypes';

// `resolveJsonModule` infers each JSON string field as plain `string`, which
// is never assignable to the narrower `'A' | 'B' | 'C'` on Choice.letter —
// a checked assignment to DilemmasResponse fails to compile for that reason
// alone, so this is a type assertion, not a plain declaration. It is still
// the only shape validation this static, hand-maintained file gets, and
// `tsc` will still catch a genuinely wrong shape (e.g. a missing `dilemmas`
// key, or a field renamed on one side but not the other) — `as` only
// tolerates the literal-widening gap, not arbitrary mismatches.
const DILEMMAS = dilemmasJson as DilemmasResponse;

export function createDilemmasRouter(): Router {
  const router = Router();

  router.get('/dilemmas', (_req, res) => {
    res.json(DILEMMAS);
  });

  return router;
}
```

- [ ] **Step 4: Wire the route into the server**

Current code (`server/src/index.ts`):

```ts
import express from 'express';
import { loadConfig } from './config';
import { createPlayerRouter } from './routes/player';
import { createAssetsRouter } from './routes/assets';
import { createCatalogRouter } from './routes/catalog';
import { createCitationPrioritiesRouter } from './routes/citationPriorities';

const PORT = 3001;

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createPlayerRouter(config));
app.use('/api', createAssetsRouter());
app.use('/api', createCatalogRouter());
app.use('/api', createCitationPrioritiesRouter());

app.listen(PORT, '127.0.0.1', () => {
  console.log(`STT tracker server listening on http://127.0.0.1:${PORT}`);
});
```

Replace with:

```ts
import express from 'express';
import { loadConfig } from './config';
import { createPlayerRouter } from './routes/player';
import { createAssetsRouter } from './routes/assets';
import { createCatalogRouter } from './routes/catalog';
import { createCitationPrioritiesRouter } from './routes/citationPriorities';
import { createDilemmasRouter } from './routes/dilemmas';

const PORT = 3001;

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createPlayerRouter(config));
app.use('/api', createAssetsRouter());
app.use('/api', createCatalogRouter());
app.use('/api', createCitationPrioritiesRouter());
app.use('/api', createDilemmasRouter());

app.listen(PORT, '127.0.0.1', () => {
  console.log(`STT tracker server listening on http://127.0.0.1:${PORT}`);
});
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p server`
Expected: PASS, no errors. (The `as DilemmasResponse` in Step 3 only tolerates JSON's string-literal widening — see that step's comment. If `tsc` still errors here, it's a real structural mismatch between the JSON and the interface — e.g. a missing/misspelled key — fix the JSON or the interface, don't reach for a second, wider assertion to silence it.)

- [ ] **Step 6: Real endpoint check**

Start the server dev process if it isn't already running: `npm run dev -w server` (or, from `server/`, `npm run dev`) — leave it running in the background.

Run: `curl -s http://127.0.0.1:3001/api/dilemmas`
Expected: JSON body with a top-level `"dilemmas"` array containing exactly 4 entries, in the order: `a-higher-duty-part-1`, `a-higher-duty-part-2`, `a-higher-duty-part-3`, `lost-among-the-stars` (source order — sorting for display happens client-side in Task 2, not here).

- [ ] **Step 7: Commit**

```bash
git add server/src/data/dilemmas.json server/src/dilemmasTypes.ts server/src/routes/dilemmas.ts server/src/index.ts
git commit -m "Add static Dilemmas data and /api/dilemmas endpoint"
```

---

### Task 2: Client — Dilemmas page, table, and nav entry

**Files:**
- Create: `client/src/types/dilemma.ts`
- Create: `client/src/api/dilemmasApi.ts`
- Create: `client/src/context/DilemmasContext.tsx`
- Create: `client/src/hooks/useDilemmas.ts`
- Modify: `client/src/App.tsx`
- Create: `client/src/dilemmas/getters.ts`
- Create: `client/src/dilemmas/DilemmasTable.tsx`
- Create: `client/src/pages/DilemmasPage.tsx`
- Modify: `client/src/routes.tsx`

**Interfaces:**
- Consumes: `GET /api/dilemmas` (Task 1) returning `{ dilemmas: Dilemma[] }`; the existing `useCrewCatalog()` hook (`client/src/hooks/useCrewCatalog.ts`) returning `{ data: CatalogEntry[] | null, loading, error }`, where `CatalogEntry` (`client/src/types/catalogEntry.ts`) has `archetype_id: number`, `name: string`, `imageUrlPortrait: string`; the existing `Thumbnail` component (`client/src/assets/Thumbnail.tsx`, prop `url?: string`) and `ASSET_BASE_URL` (`client/src/assets/config.ts`); `BLOCK_BOUNDARY_COLOR` (`client/src/theme.ts`).
- Produces: `useDilemmas()` hook returning `{ data: DilemmasResponse | null, loading: boolean, error: string | null, refresh: () => Promise<void> }`; `sortedDilemmas(dilemmas: Dilemma[]): Dilemma[]`, `getChoiceIcon(dilemma: Dilemma, choice: Choice): 'check' | 'x' | 'circle'`, `buildCatalogEntryMap(catalog: CatalogEntry[]): Map<number, CatalogEntry>` (all in `client/src/dilemmas/getters.ts`); `<DilemmasTable dilemmas={...} catalogMap={...} />`.

- [ ] **Step 1: Client-side type mirror**

Create `client/src/types/dilemma.ts`:

```ts
export interface Reward {
  crewArchetypeId: number;
  dropRatePercent: number;
  showName: boolean;
}

export interface Choice {
  letter: 'A' | 'B' | 'C';
  description: string;
  leadsToDilemmaId?: string;
  rewards?: Reward[];
}

export interface Dilemma {
  id: string;
  name: string;
  chainName: string;
  partNumber: number;
  choices: Choice[];
}

export interface DilemmasResponse {
  dilemmas: Dilemma[];
}
```

- [ ] **Step 2: API fetch wrapper**

Create `client/src/api/dilemmasApi.ts`:

```ts
import type { DilemmasResponse } from '../types/dilemma';

export async function fetchDilemmas(): Promise<DilemmasResponse> {
  const response = await fetch('/api/dilemmas');
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to load dilemmas: HTTP ${response.status}`);
  }
  return response.json() as Promise<DilemmasResponse>;
}
```

- [ ] **Step 3: Context provider**

Create `client/src/context/DilemmasContext.tsx`:

```tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { DilemmasResponse } from '../types/dilemma';
import { fetchDilemmas } from '../api/dilemmasApi';

export interface DilemmasContextValue {
  data: DilemmasResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const DilemmasContext = createContext<DilemmasContextValue | undefined>(undefined);

export function DilemmasProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DilemmasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDilemmas();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dilemmas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DilemmasContext.Provider value={{ data, loading, error, refresh: load }}>
      {children}
    </DilemmasContext.Provider>
  );
}
```

(No `fetcher` parameter on `load` unlike `CrewCatalogContext`/`PlayerDataContext` — this data has no `POST /refresh` endpoint, per the design's non-goals, so `refresh` just re-runs the same fetch.)

- [ ] **Step 4: Consumer hook**

Create `client/src/hooks/useDilemmas.ts`:

```ts
import { useContext } from 'react';
import { DilemmasContext } from '../context/DilemmasContext';

export function useDilemmas() {
  const context = useContext(DilemmasContext);
  if (context === undefined) {
    throw new Error('useDilemmas must be used within a DilemmasProvider');
  }
  return context;
}
```

- [ ] **Step 5: Mount the provider**

Current code (`client/src/App.tsx`):

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import { CrewCatalogProvider } from './context/CrewCatalogContext';
import { CitationPrioritiesProvider } from './context/CitationPrioritiesContext';
import AppLayout from './layout/AppLayout';
import { ROUTES } from './routes';

function App() {
  return (
    // CitationPrioritiesProvider is deliberately OUTERMOST, not nested with
    // the others. React fires child providers' mount effects before parent
    // providers' (child-before-parent), so whichever provider is innermost
    // issues its fetch first. Citation priorities' first fetch can occupy the
    // single-threaded server for ~12-13s (see computeCitationPriorities.ts) —
    // nesting it innermost would make /api/player and /api/catalog queue
    // behind that on every cold load, stalling the whole page instead of just
    // the two citation sections. Outermost means its fetch fires last.
    <CitationPrioritiesProvider>
      <PlayerDataProvider>
        <CrewCatalogProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                {ROUTES.map(({ path, element }) => (
                  <Route key={path} path={path} element={element} />
                ))}
              </Route>
            </Routes>
          </BrowserRouter>
        </CrewCatalogProvider>
      </PlayerDataProvider>
    </CitationPrioritiesProvider>
  );
}

export default App;
```

Replace with:

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import { CrewCatalogProvider } from './context/CrewCatalogContext';
import { CitationPrioritiesProvider } from './context/CitationPrioritiesContext';
import { DilemmasProvider } from './context/DilemmasContext';
import AppLayout from './layout/AppLayout';
import { ROUTES } from './routes';

function App() {
  return (
    // CitationPrioritiesProvider is deliberately OUTERMOST, not nested with
    // the others. React fires child providers' mount effects before parent
    // providers' (child-before-parent), so whichever provider is innermost
    // issues its fetch first. Citation priorities' first fetch can occupy the
    // single-threaded server for ~12-13s (see computeCitationPriorities.ts) —
    // nesting it innermost would make /api/player and /api/catalog queue
    // behind that on every cold load, stalling the whole page instead of just
    // the two citation sections. Outermost means its fetch fires last.
    // DilemmasProvider fetches a small static file — cheap regardless of
    // nesting position — so it goes innermost, alongside CrewCatalogProvider.
    <CitationPrioritiesProvider>
      <PlayerDataProvider>
        <CrewCatalogProvider>
          <DilemmasProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppLayout />}>
                  {ROUTES.map(({ path, element }) => (
                    <Route key={path} path={path} element={element} />
                  ))}
                </Route>
              </Routes>
            </BrowserRouter>
          </DilemmasProvider>
        </CrewCatalogProvider>
      </PlayerDataProvider>
    </CitationPrioritiesProvider>
  );
}

export default App;
```

- [ ] **Step 6: Domain getters**

Create `client/src/dilemmas/getters.ts`:

```ts
import type { CatalogEntry } from '../types/catalogEntry';
import type { Choice, Dilemma } from '../types/dilemma';

export type ChoiceIconKind = 'check' | 'x' | 'circle';

function isPositiveChoice(choice: Choice): boolean {
  return choice.leadsToDilemmaId !== undefined || (choice.rewards?.length ?? 0) > 0;
}

export function dilemmaHasRelation(dilemma: Dilemma): boolean {
  return dilemma.choices.some(isPositiveChoice);
}

// check: this choice leads to a follow-up dilemma or grants a reward — either
//   counts as a "positive" outcome.
// x: this choice does neither, but some other choice in the same dilemma
//   does — the dilemma has *some* relation, this choice just isn't it.
// circle: the whole dilemma has zero reward and zero chain link anywhere —
//   fully standalone, no relation at all.
export function getChoiceIcon(dilemma: Dilemma, choice: Choice): ChoiceIconKind {
  if (isPositiveChoice(choice)) return 'check';
  return dilemmaHasRelation(dilemma) ? 'x' : 'circle';
}

export function sortedDilemmas(dilemmas: Dilemma[]): Dilemma[] {
  return [...dilemmas].sort(
    (a, b) => a.chainName.localeCompare(b.chainName) || a.partNumber - b.partNumber
  );
}

export function buildCatalogEntryMap(catalog: CatalogEntry[]): Map<number, CatalogEntry> {
  return new Map(catalog.map((c) => [c.archetype_id, c]));
}
```

- [ ] **Step 7: Table component**

Create `client/src/dilemmas/DilemmasTable.tsx`:

```tsx
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { CheckCircle, Cancel, FiberManualRecord } from '@mui/icons-material';
import type { Choice, Dilemma } from '../types/dilemma';
import type { CatalogEntry } from '../types/catalogEntry';
import { getChoiceIcon, type ChoiceIconKind } from './getters';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';
import { BLOCK_BOUNDARY_COLOR } from '../theme';

export interface DilemmasTableProps {
  // Must already be sorted by chainName then partNumber (see getters.ts's
  // sortedDilemmas) — this component only reads adjacency, it doesn't sort.
  dilemmas: Dilemma[];
  catalogMap: Map<number, CatalogEntry>;
}

function ChoiceIcon({ kind }: { kind: ChoiceIconKind }) {
  if (kind === 'check') return <CheckCircle fontSize="small" color="success" />;
  if (kind === 'x') return <Cancel fontSize="small" color="error" />;
  return <FiberManualRecord fontSize="small" sx={{ color: 'rgba(0, 0, 0, 0.38)' }} />;
}

function ChoicesList({ dilemma }: { dilemma: Dilemma }) {
  return (
    <Box>
      {dilemma.choices.map((choice) => (
        <Box key={choice.letter} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, py: 0.25 }}>
          <ChoiceIcon kind={getChoiceIcon(dilemma, choice)} />
          <Typography variant="body2">
            <Box component="span" sx={{ fontWeight: 'bold' }}>
              {choice.letter}:
            </Box>{' '}
            {choice.description}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function rewardChoices(dilemma: Dilemma): Choice[] {
  return dilemma.choices.filter((c) => (c.rewards?.length ?? 0) > 0);
}

function RewardCell({ dilemma, catalogMap }: { dilemma: Dilemma; catalogMap: Map<number, CatalogEntry> }) {
  const choices = rewardChoices(dilemma);
  if (choices.length === 0) {
    return <Typography color="text.secondary">&mdash;</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {choices.map((choice) => (
        <Box key={choice.letter} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 1.25 }}>
            {choice.letter}:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {(choice.rewards ?? []).map((reward) => {
              const entry = catalogMap.get(reward.crewArchetypeId);
              return (
                <Box
                  key={reward.crewArchetypeId}
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}
                >
                  <Thumbnail url={entry ? `${ASSET_BASE_URL}/${entry.imageUrlPortrait}` : undefined} />
                  {reward.showName && (
                    <Typography variant="caption" align="center" sx={{ lineHeight: 1.1, mt: 0.25 }}>
                      {entry?.name ?? `#${reward.crewArchetypeId}`}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function DropRateCell({ dilemma }: { dilemma: Dilemma }) {
  const choices = rewardChoices(dilemma);
  if (choices.length === 0) {
    return <Typography color="text.secondary">&mdash;</Typography>;
  }
  // Every reward within one choice's `rewards` array always shares the same
  // dropRatePercent (see Global Constraints) — rewards[0] speaks for the choice.
  const rates = choices.map((c) => (c.rewards ?? [])[0]?.dropRatePercent ?? 0);
  const uniform = rates.every((r) => r === rates[0]);
  if (uniform) {
    return <Typography variant="body2">{rates[0]}%</Typography>;
  }
  return (
    <Box>
      {choices.map((choice, i) => (
        <Typography key={choice.letter} variant="body2">
          {choice.letter}: {rates[i]}%
        </Typography>
      ))}
    </Box>
  );
}

function DilemmasTable({ dilemmas, catalogMap }: DilemmasTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Choices</TableCell>
            <TableCell>Reward</TableCell>
            <TableCell>Drop Rate</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {dilemmas.map((dilemma, index) => {
            const isChainEnd =
              index === dilemmas.length - 1 || dilemmas[index + 1].chainName !== dilemma.chainName;
            return (
              <TableRow
                key={dilemma.id}
                sx={isChainEnd ? { '& td': { borderBottom: `2px solid ${BLOCK_BOUNDARY_COLOR}` } } : undefined}
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{dilemma.name}</TableCell>
                <TableCell>
                  <ChoicesList dilemma={dilemma} />
                </TableCell>
                <TableCell>
                  <RewardCell dilemma={dilemma} catalogMap={catalogMap} />
                </TableCell>
                <TableCell>
                  <DropRateCell dilemma={dilemma} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default DilemmasTable;
```

- [ ] **Step 8: Page component**

Create `client/src/pages/DilemmasPage.tsx`:

```tsx
import { useDilemmas } from '../hooks/useDilemmas';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { sortedDilemmas, buildCatalogEntryMap } from '../dilemmas/getters';
import DilemmasTable from '../dilemmas/DilemmasTable';
import PageShell from '../layout/PageShell';

function DilemmasPage() {
  const { data: catalog, loading: catalogLoading } = useCrewCatalog();
  const { data, loading: dilemmasLoading, error, refresh } = useDilemmas();

  const loading = dilemmasLoading || catalogLoading;
  const loaded = !loading && !error && !!data;
  const dilemmas = data ? sortedDilemmas(data.dilemmas) : [];
  const catalogMap = buildCatalogEntryMap(catalog ?? []);

  return (
    <PageShell
      title="Dilemmas"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={dilemmas.length}
      emptyMessage="No dilemmas recorded yet."
    >
      <DilemmasTable dilemmas={dilemmas} catalogMap={catalogMap} />
    </PageShell>
  );
}

export default DilemmasPage;
```

- [ ] **Step 9: Route and nav entry**

Current code (`client/src/routes.tsx`):

```tsx
import type { ReactElement } from 'react';
import OverviewPage from './pages/OverviewPage';
import FiveStarsCrewPage from './pages/FiveStarsCrewPage';
import ThreeFiveStarsCrewPage from './pages/ThreeFiveStarsCrewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
import FourFiveStarsCrewPage from './pages/FourFiveStarsCrewPage';
import FourFourStarsCrewReadyPage from './pages/FourFourStarsCrewReadyPage';
import FourFourStarsCrewPage from './pages/FourFourStarsCrewPage';
import CollectionsPage from './pages/CollectionsPage';
import DuplicatesPage from './pages/DuplicatesPage';
import FiveStarsShipsPage from './pages/FiveStarsShipsPage';
import FourStarsShipsPage from './pages/FourStarsShipsPage';
import QPsPage from './pages/QPsPage';
import FrozenCrewPage from './pages/FrozenCrewPage';

export interface NavLink {
  label: string;
  path: string;
  element: ReactElement;
}

export interface NavGroup {
  label: string;
  children: NavLink[];
}

export function isNavGroup(item: NavLink | NavGroup): item is NavGroup {
  return 'children' in item;
}

export const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { label: 'Overview', path: '/', element: <OverviewPage /> },
  {
    label: 'Crew',
    children: [
      { label: '5 Stars Crew', path: '/5-stars-crew', element: <FiveStarsCrewPage /> },
      { label: '3/5 Stars Crew', path: '/3-5-stars-crew', element: <ThreeFiveStarsCrewPage /> },
      { label: '3/4 Stars crew', path: '/3-4-stars-crew', element: <ThreeFourStarsCrewPage /> },
      { label: '4/5 Stars crew', path: '/4-5-stars-crew', element: <FourFiveStarsCrewPage /> },
      { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready', element: <FourFourStarsCrewReadyPage /> },
      { label: '4/4 Stars crew', path: '/4-4-stars-crew', element: <FourFourStarsCrewPage /> },
      { label: 'Duplicates', path: '/duplicates', element: <DuplicatesPage /> },
      { label: 'QPs', path: '/qps', element: <QPsPage /> },
      { label: '5 & 4 Stars Frozen Crew', path: '/5-4-stars-frozen-crew', element: <FrozenCrewPage /> },
    ],
  },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships', element: <FiveStarsShipsPage /> },
      { label: '4 Stars Ships', path: '/4-stars-ships', element: <FourStarsShipsPage /> },
    ],
  },
  { label: 'Collections', path: '/collections', element: <CollectionsPage /> },
];

function flattenRoutes(items: (NavLink | NavGroup)[]): NavLink[] {
  return items.flatMap((item) => (isNavGroup(item) ? item.children : [item]));
}

export const ROUTES: NavLink[] = flattenRoutes(NAV_ITEMS);
```

Replace with:

```tsx
import type { ReactElement } from 'react';
import OverviewPage from './pages/OverviewPage';
import FiveStarsCrewPage from './pages/FiveStarsCrewPage';
import ThreeFiveStarsCrewPage from './pages/ThreeFiveStarsCrewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
import FourFiveStarsCrewPage from './pages/FourFiveStarsCrewPage';
import FourFourStarsCrewReadyPage from './pages/FourFourStarsCrewReadyPage';
import FourFourStarsCrewPage from './pages/FourFourStarsCrewPage';
import CollectionsPage from './pages/CollectionsPage';
import DuplicatesPage from './pages/DuplicatesPage';
import FiveStarsShipsPage from './pages/FiveStarsShipsPage';
import FourStarsShipsPage from './pages/FourStarsShipsPage';
import QPsPage from './pages/QPsPage';
import FrozenCrewPage from './pages/FrozenCrewPage';
import DilemmasPage from './pages/DilemmasPage';

export interface NavLink {
  label: string;
  path: string;
  element: ReactElement;
}

export interface NavGroup {
  label: string;
  children: NavLink[];
}

export function isNavGroup(item: NavLink | NavGroup): item is NavGroup {
  return 'children' in item;
}

export const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { label: 'Overview', path: '/', element: <OverviewPage /> },
  {
    label: 'Crew',
    children: [
      { label: '5 Stars Crew', path: '/5-stars-crew', element: <FiveStarsCrewPage /> },
      { label: '3/5 Stars Crew', path: '/3-5-stars-crew', element: <ThreeFiveStarsCrewPage /> },
      { label: '3/4 Stars crew', path: '/3-4-stars-crew', element: <ThreeFourStarsCrewPage /> },
      { label: '4/5 Stars crew', path: '/4-5-stars-crew', element: <FourFiveStarsCrewPage /> },
      { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready', element: <FourFourStarsCrewReadyPage /> },
      { label: '4/4 Stars crew', path: '/4-4-stars-crew', element: <FourFourStarsCrewPage /> },
      { label: 'Duplicates', path: '/duplicates', element: <DuplicatesPage /> },
      { label: 'QPs', path: '/qps', element: <QPsPage /> },
      { label: '5 & 4 Stars Frozen Crew', path: '/5-4-stars-frozen-crew', element: <FrozenCrewPage /> },
    ],
  },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships', element: <FiveStarsShipsPage /> },
      { label: '4 Stars Ships', path: '/4-stars-ships', element: <FourStarsShipsPage /> },
    ],
  },
  { label: 'Collections', path: '/collections', element: <CollectionsPage /> },
  { label: 'Dilemmas', path: '/dilemmas', element: <DilemmasPage /> },
];

function flattenRoutes(items: (NavLink | NavGroup)[]): NavLink[] {
  return items.flatMap((item) => (isNavGroup(item) ? item.children : [item]));
}

export const ROUTES: NavLink[] = flattenRoutes(NAV_ITEMS);
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit -p client`
Expected: PASS, no errors.

- [ ] **Step 11: Real-browser check**

Using the `playwright` npm library (per this repo's CLAUDE.md — headless `chromium.launch()`), against the running dev app's `/dilemmas` route, with real player data loaded (so the crew catalog is populated):

1. Confirm the nav's top-level list ends with "Dilemmas", immediately after "Collections", and clicking it routes to `/dilemmas`.
2. Confirm 4 rows render in this order: "A Higher Duty, Part 1", "A Higher Duty, Part 2", "A Higher Duty, Part 3", "Lost Among the Stars" (alphabetical by chain name, then part number).
3. Row 1 (Part 1): choices A and B show the green check icon, choice C shows the red X icon.
4. Row 2 (Part 2): choice A shows red X, choice B shows green check.
5. Row 3 (Part 3): choices A and B **both** show green check (each has a reward). Reward column shows Fierce Guinan and Dr. Leonard McCoy **side by side** (not stacked), each with a portrait and name underneath. Drop Rate column shows a single `"100%"`.
6. Row 4 (Lost Among the Stars): choice A shows green check, choice B shows red X. Reward column shows 11 crew portraits side by side, no names underneath any of them. Drop Rate column shows a single `"2%"`.
7. Confirm rows 1-3 (the "A Higher Duty" chain) sit together with a visibly thicker divider under row 3, separating them from row 4.

- [ ] **Step 12: Commit**

```bash
git add client/src/types/dilemma.ts client/src/api/dilemmasApi.ts client/src/context/DilemmasContext.tsx client/src/hooks/useDilemmas.ts client/src/App.tsx client/src/dilemmas/getters.ts client/src/dilemmas/DilemmasTable.tsx client/src/pages/DilemmasPage.tsx client/src/routes.tsx
git commit -m "Add the Dilemmas page: nav entry, table, and data wiring"
```
