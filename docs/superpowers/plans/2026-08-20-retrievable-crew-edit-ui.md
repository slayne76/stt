# Retrievable Crew Add/Edit/Delete UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the read-only Retrievable Crew page (`/retrievable-crew`) editable: add a crew, edit an existing row's crew and/or chosen Polestars, delete a row — all through the UI, writing to `server/data/retrievable-crew.json` via new write endpoints.

**Architecture:** Three new Express routes (`POST`/`PUT`/`DELETE /api/retrievable-crew[...]`) on top of the already-existing `writeRetrievableCrew()`, plus client-side write wrappers folded into the existing `RetrievableCrewContext`. On the frontend: a single-select checkbox column drives an Add/Edit/Delete button group; Delete goes through a confirm dialog; Add and Edit share one form dialog built from two brand-new-to-this-app MUI components (`Autocomplete`, `Dialog`) plus a small extracted `PolestarBadge` component reused by both the dialog's interactive picker and the existing read-only table cell.

**Tech Stack:** Express + TypeScript (server), React + TypeScript + MUI v6 (client) — same as the rest of the app. No new dependencies; `Dialog`/`Autocomplete`/`Checkbox` are all stock `@mui/material` exports already available via the existing dependency.

**Design doc:** `docs/superpowers/specs/2026-08-20-retrievable-crew-edit-ui-design.md` (read this first if anything below is ambiguous).

## Global Constraints

- **`npx tsc --noEmit -p client` is a silent no-op** (`client/tsconfig.json` is solution-style) — always use `npx tsc -b client` instead. `npx tsc --noEmit -p server` is a real check and correct for the server side.
- **No test framework in this project (deliberate choice)** — do not add one. Verification per task is `tsc` clean, plus `curl` (server tasks) or a real-browser Playwright check (client tasks) against the running dev server. The final task (Task 5) runs the full spec verification plan end to end.
- **`server/data/` is entirely gitignored** and this worktree's copy starts empty (`git worktree add` doesn't copy it). Before any task that needs realistic data, copy from the main checkout: `cp <main-repo-root>/server/data/player-cache.json server/data/`, `cp <main-repo-root>/server/data/crew-catalog-cache.json server/data/`, `cp <main-repo-root>/server/data/polestar-catalog-cache.json server/data/`, `cp <main-repo-root>/server/data/retrievable-crew.json server/data/` — replace `<main-repo-root>` with this worktree's actual main-checkout path (find it via `git worktree list`). The main checkout's `retrievable-crew.json` currently holds exactly one real row (Minooki Freeman, `archetypeId: 26275`) — do not delete or overwrite it during testing; use a throwaway `archetypeId` (e.g. `999001`+) for any row you create/delete while verifying, and confirm the real row is untouched at the end of each task that touches the store.
- **Never commit on `main`.** Run `git branch --show-current` before every commit in this plan and confirm it is NOT `main`. All code changes happen in this plan's worktree.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU
  ```
- **Crew names are assumed unique across the crew catalog** for exact-name resolution — same assumption the existing Dilemmas feature already relies on to resolve reward crew names against `archetype_id`.
- **Polestar slot order (#1-4) carries no gameplay significance** — it's a fixed display-column convention only (confirmed in the original feature's design doc). Selection order mapping to slot order in the new UI is therefore an arbitrary-but-stable choice, not a business rule.
- Server routes do **not** validate `archetypeId`/`polestars` against the live crew/Polestar catalogs — only structural shape (types, counts, duplicate ids). The client-side Autocomplete/picker are the only gate for "is this a real, eligible crew/Polestar" — this is a deliberate scope decision from the design doc's Non-goals, not an oversight.

---

### Task 1: Server — write endpoints (POST/PUT/DELETE)

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/routes/retrievableCrew.ts`

**Interfaces:**
- Consumes: `readRetrievableCrew()`/`writeRetrievableCrew()` (existing, `server/src/retrievableCrewStore.ts`), `RetrievableCrewEntry` (existing, `server/src/retrievableCrewTypes.ts`).
- Produces: `POST /api/retrievable-crew`, `PUT /api/retrievable-crew/:archetypeId`, `DELETE /api/retrievable-crew/:archetypeId` — consumed by Task 2's client API wrappers.

- [ ] **Step 1: Add JSON body parsing to `server/src/index.ts`**

This is the first route in the app that reads `req.body` — no existing route needs it, so there's no body-parsing middleware yet.

Change:
```ts
const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
```
to:
```ts
const config = loadConfig();
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
```

- [ ] **Step 2: Replace `server/src/routes/retrievableCrew.ts` with the full read+write router**

```ts
import { Router } from 'express';
import { readRetrievableCrew, writeRetrievableCrew } from '../retrievableCrewStore';
import type { RetrievableCrewEntry } from '../retrievableCrewTypes';

const MAX_POLESTAR_SLOTS = 4;

// Structural validation only — does NOT check archetypeId/polestars against
// the live crew/Polestar catalogs. That's a deliberate scope decision (see
// design doc Non-goals): the client-side Autocomplete/picker are the only
// gate for "is this a real, eligible crew/Polestar". This just guards the
// stored JSON's shape.
function isValidPolestarsArray(value: unknown): value is (number | null)[] {
  if (!Array.isArray(value) || value.length > MAX_POLESTAR_SLOTS) return false;
  const nonNullIds: number[] = [];
  for (const item of value) {
    if (item === null) continue;
    if (typeof item !== 'number' || !Number.isInteger(item) || item <= 0) return false;
    nonNullIds.push(item);
  }
  return new Set(nonNullIds).size === nonNullIds.length; // no duplicate ids within one row
}

// Always exactly 4 slots on write, same normalization convention the client
// already applies defensively on read (buildRetrievableCrewRows).
function normalizePolestars(value: (number | null)[]): (number | null)[] {
  return Array.from({ length: MAX_POLESTAR_SLOTS }, (_, i) => value[i] ?? null);
}

function parseBody(body: unknown): RetrievableCrewEntry | null {
  if (typeof body !== 'object' || body === null) return null;
  const { archetypeId, polestars } = body as Record<string, unknown>;
  if (typeof archetypeId !== 'number' || !Number.isInteger(archetypeId) || archetypeId <= 0) return null;
  if (!isValidPolestarsArray(polestars)) return null;
  return { archetypeId, polestars: normalizePolestars(polestars as (number | null)[]) };
}

function parsePathArchetypeId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function createRetrievableCrewRouter(): Router {
  const router = Router();

  router.get('/retrievable-crew', (_req, res) => {
    res.json(readRetrievableCrew());
  });

  router.post('/retrievable-crew', (req, res) => {
    const parsed = parseBody(req.body);
    if (!parsed) {
      res.status(400).json({ error: 'Invalid archetypeId or polestars in request body' });
      return;
    }
    const entries = readRetrievableCrew();
    if (entries.some((e) => e.archetypeId === parsed.archetypeId)) {
      res.status(409).json({ error: 'This crew is already tracked' });
      return;
    }
    const updated: RetrievableCrewEntry[] = [...entries, parsed];
    writeRetrievableCrew(updated);
    res.status(201).json(updated);
  });

  router.put('/retrievable-crew/:archetypeId', (req, res) => {
    const pathId = parsePathArchetypeId(req.params.archetypeId);
    if (pathId === null) {
      res.status(400).json({ error: 'Invalid archetypeId in URL' });
      return;
    }
    const parsed = parseBody(req.body);
    if (!parsed) {
      res.status(400).json({ error: 'Invalid archetypeId or polestars in request body' });
      return;
    }
    const entries = readRetrievableCrew();
    const existingIndex = entries.findIndex((e) => e.archetypeId === pathId);
    if (existingIndex === -1) {
      res.status(404).json({ error: 'No tracked crew found for that archetypeId' });
      return;
    }
    // The body's archetypeId may differ from the path's (the row's crew was
    // changed) — only reject if it collides with a DIFFERENT existing row.
    const collidesWithAnotherRow = entries.some((e, i) => i !== existingIndex && e.archetypeId === parsed.archetypeId);
    if (collidesWithAnotherRow) {
      res.status(409).json({ error: 'This crew is already tracked by another row' });
      return;
    }
    const updated = [...entries];
    updated[existingIndex] = parsed;
    writeRetrievableCrew(updated);
    res.json(updated);
  });

  router.delete('/retrievable-crew/:archetypeId', (req, res) => {
    const pathId = parsePathArchetypeId(req.params.archetypeId);
    if (pathId === null) {
      res.status(400).json({ error: 'Invalid archetypeId in URL' });
      return;
    }
    const entries = readRetrievableCrew();
    const existingIndex = entries.findIndex((e) => e.archetypeId === pathId);
    if (existingIndex === -1) {
      res.status(404).json({ error: 'No tracked crew found for that archetypeId' });
      return;
    }
    const updated = entries.filter((e) => e.archetypeId !== pathId);
    writeRetrievableCrew(updated);
    res.json(updated);
  });

  return router;
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit -p server
```
Expected: no errors.

Start the server (`cd server && npm run dev`, backgrounded). With `server/data/retrievable-crew.json` absent or `[]`:

```bash
BASE=http://127.0.0.1:3001/api/retrievable-crew

# 1. Empty list
curl -s $BASE
# Expected: []

# 2. Add a throwaway row
curl -s -X POST -H "Content-Type: application/json" -d '{"archetypeId":999001,"polestars":[1,2,null,null]}' $BASE
# Expected: 201-status JSON array containing {"archetypeId":999001,"polestars":[1,2,null,null]}

# 3. Duplicate add is rejected
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"archetypeId":999001,"polestars":[]}' $BASE
# Expected: 409

# 4. Malformed body is rejected
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"polestars":[1]}' $BASE
# Expected: 400

# 5. Edit the row's Polestars (same crew)
curl -s -X PUT -H "Content-Type: application/json" -d '{"archetypeId":999001,"polestars":[5,6,7,8]}' $BASE/999001
# Expected: 200, entry now has polestars [5,6,7,8]

# 6. Edit the row's crew (swap archetypeId via PUT)
curl -s -X PUT -H "Content-Type: application/json" -d '{"archetypeId":999002,"polestars":[1,null,null,null]}' $BASE/999001
# Expected: 200, response array has an entry keyed 999002, none keyed 999001 anymore

# 7. Add a second throwaway row
curl -s -X POST -H "Content-Type: application/json" -d '{"archetypeId":999003,"polestars":[]}' $BASE
# Expected: 201, polestars normalized to [null,null,null,null]

# 8. Editing 999002 to collide with 999003 is rejected
curl -s -o /dev/null -w "%{http_code}\n" -X PUT -H "Content-Type: application/json" -d '{"archetypeId":999003,"polestars":[]}' $BASE/999002
# Expected: 409

# 9. Delete cleanup
curl -s -X DELETE $BASE/999002
curl -s -X DELETE $BASE/999003
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $BASE/999002
# Expected: last call 404 (already deleted)

# 10. Confirm clean state
curl -s $BASE
```
Expected final `curl -s $BASE` result: `[]` if you started empty, or exactly the real seed data (Minooki Freeman, `archetypeId: 26275`) if you copied it in per the Global Constraints note — confirm no `999xxx` rows remain either way.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must NOT print "main"
git add server/src/index.ts server/src/routes/retrievableCrew.ts
git commit -m "Add Retrievable Crew write endpoints (POST/PUT/DELETE)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 2: Client — write API wrappers + context methods

**Files:**
- Modify: `client/src/api/retrievableCrewApi.ts`
- Modify: `client/src/context/RetrievableCrewContext.tsx`

**Interfaces:**
- Consumes: `POST`/`PUT`/`DELETE /api/retrievable-crew[...]` (Task 1).
- Produces: `useRetrievableCrew()` now also returns `addEntry(entry): Promise<void>`, `updateEntry(originalArchetypeId, entry): Promise<void>`, `deleteEntry(archetypeId): Promise<void>` — consumed by Task 4 (`deleteEntry`) and Task 5 (`addEntry`/`updateEntry`).

- [ ] **Step 1: Replace `client/src/api/retrievableCrewApi.ts`**

```ts
import type { RetrievableCrewEntry } from '../types/retrievableCrew';

async function parseRetrievableCrewListResponse(response: Response, action: string): Promise<RetrievableCrewEntry[]> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `Failed to ${action}: HTTP ${response.status}`);
  }
  return response.json() as Promise<RetrievableCrewEntry[]>;
}

export async function fetchRetrievableCrew(): Promise<RetrievableCrewEntry[]> {
  const response = await fetch('/api/retrievable-crew');
  return parseRetrievableCrewListResponse(response, 'load retrievable crew');
}

export async function addRetrievableCrew(entry: RetrievableCrewEntry): Promise<RetrievableCrewEntry[]> {
  const response = await fetch('/api/retrievable-crew', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return parseRetrievableCrewListResponse(response, 'add retrievable crew');
}

export async function updateRetrievableCrew(
  originalArchetypeId: number,
  entry: RetrievableCrewEntry
): Promise<RetrievableCrewEntry[]> {
  const response = await fetch(`/api/retrievable-crew/${originalArchetypeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return parseRetrievableCrewListResponse(response, 'update retrievable crew');
}

export async function deleteRetrievableCrew(archetypeId: number): Promise<RetrievableCrewEntry[]> {
  const response = await fetch(`/api/retrievable-crew/${archetypeId}`, { method: 'DELETE' });
  return parseRetrievableCrewListResponse(response, 'delete retrievable crew');
}
```

(`fetchRetrievableCrew`'s error text is unchanged — `parseRetrievableCrewListResponse(response, 'load retrievable crew')` produces the exact same `"Failed to load retrievable crew: HTTP ..."` fallback as before.)

- [ ] **Step 2: Replace `client/src/context/RetrievableCrewContext.tsx`**

```tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import {
  fetchRetrievableCrew,
  addRetrievableCrew,
  updateRetrievableCrew,
  deleteRetrievableCrew,
} from '../api/retrievableCrewApi';

export interface RetrievableCrewContextValue {
  data: RetrievableCrewEntry[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addEntry: (entry: RetrievableCrewEntry) => Promise<void>;
  updateEntry: (originalArchetypeId: number, entry: RetrievableCrewEntry) => Promise<void>;
  deleteEntry: (archetypeId: number) => Promise<void>;
}

export const RetrievableCrewContext = createContext<RetrievableCrewContextValue | undefined>(undefined);

export function RetrievableCrewProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<RetrievableCrewEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRetrievableCrew();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load retrievable crew');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Mutation methods are user-initiated (Add/Edit/Delete dialogs), not
  // page-load fetches — they deliberately don't touch loading/error (those
  // stay reserved for the initial page-load state). Failures propagate to
  // the caller so the dialog/page can show its own inline error (e.g. a
  // Snackbar) and decide whether to keep a form open, instead of the whole
  // page falling back to its error state.
  const addEntry = useCallback(async (entry: RetrievableCrewEntry) => {
    const result = await addRetrievableCrew(entry);
    setData(result);
  }, []);

  const updateEntry = useCallback(async (originalArchetypeId: number, entry: RetrievableCrewEntry) => {
    const result = await updateRetrievableCrew(originalArchetypeId, entry);
    setData(result);
  }, []);

  const deleteEntry = useCallback(async (archetypeId: number) => {
    const result = await deleteRetrievableCrew(archetypeId);
    setData(result);
  }, []);

  return (
    <RetrievableCrewContext.Provider
      value={{ data, loading, error, refresh: load, addEntry, updateEntry, deleteEntry }}
    >
      {children}
    </RetrievableCrewContext.Provider>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b client
```
Expected: no errors. No UI consumes `addEntry`/`updateEntry`/`deleteEntry` yet (that's Tasks 4-5) — matching this project's established precedent for a subsystem task landing ahead of its UI consumer, this task's only check is a clean typecheck; Task 1's `curl` pass already proved the underlying endpoints work.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must NOT print "main"
git add client/src/api/retrievableCrewApi.ts client/src/context/RetrievableCrewContext.tsx
git commit -m "Add Retrievable Crew write API wrappers + context methods

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 3: Client — extract `PolestarBadge`, refactor the read-only table to use it

**Files:**
- Create: `client/src/polestars/PolestarBadge.tsx`
- Modify: `client/src/polestars/RetrievableCrewTable.tsx`

**Interfaces:**
- Consumes: `getPolestarTypeColor` (existing, `polestars/getters.ts`), `Thumbnail` (existing, `assets/Thumbnail.tsx`).
- Produces: default-exported `PolestarBadge` component — consumed by Task 5's `RetrievableCrewFormDialog` (interactive picker) in addition to this task's own read-only table cell.

This is a pure visual refactor — zero behavior/appearance change to the existing table. It exists so Task 5's Add/Edit dialog can reuse the exact same badge instead of duplicating the circular-thumbnail-plus-caption markup.

- [ ] **Step 1: Create `client/src/polestars/PolestarBadge.tsx`**

```tsx
import { Box, Typography } from '@mui/material';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import { getPolestarTypeColor } from './getters';
import Thumbnail from '../assets/Thumbnail';

// Grey — the "eligible but not currently selected" state in the Add/Edit
// dialog's picker. Never actually shown by the read-only table (a rendered
// slot there is always a real, chosen Polestar, so it always passes
// selected={true}).
const UNSELECTED_BADGE_COLOR = '#9E9E9E';

export interface PolestarBadgeProps {
  entry: PolestarCatalogEntry;
  // Colored by type (rarity red / trait purple / skill blue) when true,
  // grey when false.
  selected: boolean;
  // Presence makes the badge clickable (cursor pointer, hover-free by
  // design — no hover state was specced). Omit for a static display.
  onClick?: () => void;
  // Only meaningful alongside onClick — dims the badge and suppresses the
  // click handler (used once 4 Polestars are already selected).
  disabled?: boolean;
}

function PolestarBadge({ entry, selected, onClick, disabled }: PolestarBadgeProps) {
  const interactive = onClick !== undefined && !disabled;
  return (
    <Box
      onClick={interactive ? onClick : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 56,
        gap: '2px',
        mx: 'auto',
        cursor: interactive ? 'pointer' : 'default',
        opacity: onClick !== undefined && disabled ? 0.4 : 1,
      }}
    >
      <Thumbnail
        asset={entry.icon}
        circleBackgroundColor={selected ? getPolestarTypeColor(entry.filter.type) : UNSELECTED_BADGE_COLOR}
      />
      <Typography variant="caption" align="center" sx={{ lineHeight: 1.1 }}>
        {entry.short_name}
      </Typography>
    </Box>
  );
}

export default PolestarBadge;
```

- [ ] **Step 2: Replace `client/src/polestars/RetrievableCrewTable.tsx`**

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import type { RetrievableCrewRow } from './getters';
import { resolvePolestarSlot } from './getters';
import { usePagination } from '../lib/usePagination';
import StarRating from '../crew/StarRating';
import Thumbnail from '../assets/Thumbnail';
import PolestarBadge from './PolestarBadge';
import TablePaginationFooter from '../components/TablePaginationFooter';

export interface RetrievableCrewTableProps {
  rows: RetrievableCrewRow[];
  polestarCatalogMap: Map<number, PolestarCatalogEntry>;
}

function EmDash() {
  return <Typography color="text.secondary">&mdash;</Typography>;
}

function PolestarCell({
  id,
  polestarCatalogMap,
}: {
  id: number | null;
  polestarCatalogMap: Map<number, PolestarCatalogEntry>;
}) {
  const entry = resolvePolestarSlot(id, polestarCatalogMap);
  if (entry === null) {
    return <EmDash />;
  }
  return <PolestarBadge entry={entry} selected />;
}

function RetrievableCrewTable({ rows, polestarCatalogMap }: RetrievableCrewTableProps) {
  const { pageItems, page, pageSize, showPagination, handlePageChange, handlePageSizeChange } = usePagination(rows);

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Items to equip</TableCell>
            <TableCell align="right">Total collections</TableCell>
            <TableCell align="center">Polestar #1</TableCell>
            <TableCell align="center">Polestar #2</TableCell>
            <TableCell align="center">Polestar #3</TableCell>
            <TableCell align="center">Polestar #4</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageItems.map((row, index) => (
            <TableRow key={row.archetypeId}>
              <TableCell>{page * pageSize + index + 1}</TableCell>
              <TableCell>
                <Thumbnail url={row.portraitUrl} />
              </TableCell>
              <TableCell>
                {row.rarity === null ? <EmDash /> : <StarRating rarity={row.rarity} maxRarity={row.maxRarity} />}
              </TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell align="right">{row.level === null ? <EmDash /> : row.level}</TableCell>
              <TableCell align="right">{row.itemsToEquip === null ? <EmDash /> : row.itemsToEquip}</TableCell>
              <TableCell align="right">{row.totalCollections}</TableCell>
              {row.polestarIds.map((id, slotIndex) => (
                <TableCell key={slotIndex} align="center">
                  <PolestarCell id={id} polestarCatalogMap={polestarCatalogMap} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TablePaginationFooter
          show={showPagination}
          count={rows.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          colSpan={11}
        />
      </Table>
    </TableContainer>
  );
}

export default RetrievableCrewTable;
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b client
```
Expected: no errors (in particular, no unused-import errors — `noUnusedLocals` is on — the old file's `Box`/`getPolestarTypeColor` imports are correctly gone).

With the server and client dev servers running and `server/data/{player-cache,crew-catalog-cache,polestar-catalog-cache,retrievable-crew}.json` copied in per the Global Constraints note, open `/retrievable-crew` in a headless-Chromium Playwright session:
- Confirm the Minooki Freeman row still renders its 3 Polestar badges (Desperate/Explorer/Spiritual) with the same colors as before this refactor (rarity=red `#B71C1C` / trait=purple `#6A1B9A` / skill=blue `#1565C0`, matching whichever `filter.type` each of those three actually is) and Polestar #4 still shows `—`.
- Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must NOT print "main"
git add client/src/polestars/PolestarBadge.tsx client/src/polestars/RetrievableCrewTable.tsx
git commit -m "Extract PolestarBadge from RetrievableCrewTable (pure refactor)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 4: Client — row selection, Add/Edit/Delete buttons, delete flow

**Files:**
- Modify: `client/src/polestars/RetrievableCrewTable.tsx`
- Create: `client/src/polestars/RetrievableCrewActions.tsx`
- Create: `client/src/polestars/DeleteConfirmDialog.tsx`
- Modify: `client/src/pages/RetrievableCrewPage.tsx`

**Interfaces:**
- Consumes: `deleteEntry` (Task 2), `PolestarBadge` (Task 3, unchanged).
- Produces: `RetrievableCrewTable` now takes `selectedArchetypeId`/`onSelect` props; `RetrievableCrewActions`, `DeleteConfirmDialog` components — the page's `dialogMode`/`formInitialEntry` wiring these Add/Edit buttons drive is completed in Task 5 (this task's Add/Edit handlers are intentionally inert — see Step 4).

- [ ] **Step 1: Add a single-select checkbox column to `client/src/polestars/RetrievableCrewTable.tsx`**

Change the props interface from:
```ts
export interface RetrievableCrewTableProps {
  rows: RetrievableCrewRow[];
  polestarCatalogMap: Map<number, PolestarCatalogEntry>;
}
```
to:
```ts
export interface RetrievableCrewTableProps {
  rows: RetrievableCrewRow[];
  polestarCatalogMap: Map<number, PolestarCatalogEntry>;
  selectedArchetypeId: number | null;
  onSelect: (archetypeId: number | null) => void;
}
```

Add `Checkbox` to the `@mui/material` import:
```ts
import { Checkbox, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
```

Change the component signature from:
```ts
function RetrievableCrewTable({ rows, polestarCatalogMap }: RetrievableCrewTableProps) {
```
to:
```ts
function RetrievableCrewTable({ rows, polestarCatalogMap, selectedArchetypeId, onSelect }: RetrievableCrewTableProps) {
```

Add an empty checkbox header cell as the new first column:
```tsx
<TableRow>
  <TableCell padding="checkbox" />
  <TableCell>#</TableCell>
```

Add the checkbox body cell as the new first cell of each row (single-select: clicking the currently-selected row's own checkbox deselects it):
```tsx
<TableRow key={row.archetypeId}>
  <TableCell padding="checkbox">
    <Checkbox
      checked={row.archetypeId === selectedArchetypeId}
      onChange={() => onSelect(row.archetypeId === selectedArchetypeId ? null : row.archetypeId)}
      inputProps={{ 'aria-label': `Select ${row.name}` }}
    />
  </TableCell>
  <TableCell>{page * pageSize + index + 1}</TableCell>
```

Change the footer's `colSpan` from `11` to `12` (one more column now):
```tsx
<TablePaginationFooter
  show={showPagination}
  count={rows.length}
  page={page}
  pageSize={pageSize}
  onPageChange={handlePageChange}
  onPageSizeChange={handlePageSizeChange}
  colSpan={12}
/>
```

- [ ] **Step 2: Create `client/src/polestars/RetrievableCrewActions.tsx`**

```tsx
import { Box, Button } from '@mui/material';

export interface RetrievableCrewActionsProps {
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}

function RetrievableCrewActions({ onAdd, onEdit, onDelete, canEdit, canDelete }: RetrievableCrewActionsProps) {
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button variant="contained" onClick={onAdd}>
        Add
      </Button>
      <Button variant="outlined" onClick={onEdit} disabled={!canEdit}>
        Edit
      </Button>
      <Button variant="outlined" color="error" onClick={onDelete} disabled={!canDelete}>
        Delete
      </Button>
    </Box>
  );
}

export default RetrievableCrewActions;
```

- [ ] **Step 3: Create `client/src/polestars/DeleteConfirmDialog.tsx`**

```tsx
import { Button, CircularProgress, Dialog, DialogActions, DialogTitle } from '@mui/material';

export interface DeleteConfirmDialogProps {
  open: boolean;
  crewName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmDialog({ open, crewName, submitting, onCancel, onConfirm }: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={submitting ? undefined : onCancel}>
      <DialogTitle>Delete {crewName} from Retrievable Crew?</DialogTitle>
      <DialogActions>
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={onConfirm}
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default DeleteConfirmDialog;
```

- [ ] **Step 4: Replace `client/src/pages/RetrievableCrewPage.tsx`**

Note on `PageShell`: its `children` only render once `loaded && count > 0` (see `client/src/layout/PageShell.tsx`) — so anything that must work even on an *empty* list (the Add button's dialog, in Task 5) or during an in-flight mutation cannot be nested inside `<PageShell>...</PageShell>`. This task switches the page to a `<>...</>` fragment with `PageShell` (table only) as one child and the dialogs/Snackbar as siblings after it, specifically so Task 5's Add flow works starting from zero rows.

```tsx
import { useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { usePolestarCatalog } from '../hooks/usePolestarCatalog';
import { useRetrievableCrew } from '../hooks/useRetrievableCrew';
import { getCrewList } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import { buildRetrievableCrewRows, buildPolestarCatalogMap } from '../polestars/getters';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import RetrievableCrewTable from '../polestars/RetrievableCrewTable';
import RetrievableCrewActions from '../polestars/RetrievableCrewActions';
import DeleteConfirmDialog from '../polestars/DeleteConfirmDialog';
import PageShell from '../layout/PageShell';

function RetrievableCrewPage() {
  const { data: playerData, loading: playerLoading } = usePlayerData();
  const { data: catalog, loading: catalogLoading } = useCrewCatalog();
  const { data: polestarCatalog, loading: polestarCatalogLoading } = usePolestarCatalog();
  const {
    data: retrievableCrew,
    loading: retrievableCrewLoading,
    error,
    refresh,
    deleteEntry,
  } = useRetrievableCrew();

  const [selectedArchetypeId, setSelectedArchetypeId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RetrievableCrewEntry | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  const loading = playerLoading || catalogLoading || polestarCatalogLoading || retrievableCrewLoading;
  const loaded = !loading && !error && !!retrievableCrew;

  const crewList = playerData ? getCrewList(playerData) : [];
  const collections = playerData ? getCollectionsList(playerData) : [];
  const rows = loaded ? buildRetrievableCrewRows(retrievableCrew, catalog ?? [], crewList, collections) : [];
  const polestarCatalogMap = buildPolestarCatalogMap(polestarCatalog ?? []);

  function crewLabel(archetypeId: number): string {
    return catalog?.find((c) => c.archetype_id === archetypeId)?.name ?? `archetype ${archetypeId}`;
  }

  // Real Add/Edit dialog wiring lands in the next task (RetrievableCrewFormDialog).
  // This task's scope is selection + the Delete flow only.
  function handleAddClick() {}
  function handleEditClick() {}

  function handleDeleteClick() {
    const entry = retrievableCrew?.find((e) => e.archetypeId === selectedArchetypeId) ?? null;
    if (entry) setDeleteTarget(entry);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const label = crewLabel(deleteTarget.archetypeId);
    setDeleteSubmitting(true);
    try {
      await deleteEntry(deleteTarget.archetypeId);
      setSnackbar({ severity: 'success', message: `Deleted ${label}.` });
      setDeleteTarget(null);
      setSelectedArchetypeId(null);
    } catch (err) {
      setSnackbar({ severity: 'error', message: err instanceof Error ? err.message : 'Failed to delete' });
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <>
      <PageShell
        title="Retrievable Crew"
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
        loaded={loaded}
        count={rows.length}
        emptyMessage="No retrievable crew tracked yet."
        titleActions={
          <RetrievableCrewActions
            onAdd={handleAddClick}
            onEdit={handleEditClick}
            onDelete={handleDeleteClick}
            canEdit={selectedArchetypeId !== null}
            canDelete={selectedArchetypeId !== null}
          />
        }
      >
        <RetrievableCrewTable
          rows={rows}
          polestarCatalogMap={polestarCatalogMap}
          selectedArchetypeId={selectedArchetypeId}
          onSelect={setSelectedArchetypeId}
        />
      </PageShell>
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        crewName={deleteTarget ? crewLabel(deleteTarget.archetypeId) : ''}
        submitting={deleteSubmitting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
      <Snackbar open={snackbar !== null} autoHideDuration={6000} onClose={() => setSnackbar(null)}>
        <Alert severity={snackbar?.severity ?? 'success'} onClose={() => setSnackbar(null)}>
          {snackbar?.message ?? ''}
        </Alert>
      </Snackbar>
    </>
  );
}

export default RetrievableCrewPage;
```

- [ ] **Step 5: Verify**

```bash
npx tsc -b client
```
Expected: no errors.

With both dev servers running and `server/data/*.json` seeded (per Global Constraints), plus one throwaway row added via `curl` for this test (so the real Minooki Freeman row is never the one being deleted):
```bash
curl -s -X POST -H "Content-Type: application/json" -d '{"archetypeId":999010,"polestars":[]}' http://127.0.0.1:3001/api/retrievable-crew
```

Real-browser Playwright pass against `/retrievable-crew`:
1. Load the page — Edit and Delete buttons are disabled, Add is enabled.
2. Click the throwaway row's checkbox — Edit and Delete become enabled.
3. Click a different row's checkbox — the first row's checkbox becomes unchecked, the new one is checked (single-select).
4. Click the throwaway row's checkbox again — it unchecks, Edit/Delete disable again.
5. Re-select the throwaway row, click Delete — confirm dialog opens showing its crew label. Click Cancel — dialog closes, row still present in the table, and no `DELETE` request appears in the network log.
6. Click Delete again, then click the dialog's Delete button — dialog closes, row disappears from the table, a green success Snackbar appears, and `server/data/retrievable-crew.json` no longer contains `archetypeId: 999010`. Confirm the real Minooki Freeman row (`26275`) is still present and untouched.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must NOT print "main"
git add client/src/polestars/RetrievableCrewTable.tsx client/src/polestars/RetrievableCrewActions.tsx client/src/polestars/DeleteConfirmDialog.tsx client/src/pages/RetrievableCrewPage.tsx
git commit -m "Add row selection + Add/Edit/Delete buttons + delete flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```

---

### Task 5: Client — Add/Edit form dialog, full wiring, final verification

**Files:**
- Modify: `client/src/polestars/getters.ts`
- Create: `client/src/polestars/RetrievableCrewFormDialog.tsx`
- Modify: `client/src/pages/RetrievableCrewPage.tsx`

**Interfaces:**
- Consumes: `addEntry`/`updateEntry` (Task 2), `PolestarBadge` (Task 3), `resolveEligiblePolestars` (existing, `polestars/getters.ts`).
- Produces: default-exported `RetrievableCrewFormDialog` — consumed only by this task's own page wiring (terminal component in this plan).

- [ ] **Step 1: Add `getEligibleRetrievableCandidates` to `client/src/polestars/getters.ts`**

Add this function anywhere below the existing `buildPolestarCatalogMap`:

```ts
// Autocomplete SUGGESTION pool for the Add/Edit dialog: catalog crew with at
// least 1 eligible Polestar (so the picker below a suggestion is never
// empty/a dead end), excluding crew already tracked by ANOTHER row (the row
// currently being edited, if any, stays suggestable — excludeArchetypeId).
// NOT used for resolving/validating whatever the user actually typed — see
// RetrievableCrewFormDialog's separate, broader `eligiblePool`, which
// deliberately includes already-tracked crew so a genuine duplicate can
// still be resolved and reported with its own specific error message.
export function getEligibleRetrievableCandidates(
  catalog: CatalogEntry[],
  trackedArchetypeIds: Set<number>,
  excludeArchetypeId: number | null
): CatalogEntry[] {
  return catalog.filter(
    (c) => c.polestarFilterKeys.length > 0 && (!trackedArchetypeIds.has(c.archetype_id) || c.archetype_id === excludeArchetypeId)
  );
}
```

- [ ] **Step 2: Create `client/src/polestars/RetrievableCrewFormDialog.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import { getEligibleRetrievableCandidates, resolveEligiblePolestars } from './getters';
import PolestarBadge from './PolestarBadge';

const MAX_POLESTARS = 4;
const MIN_SEARCH_LENGTH = 3;
const MAX_SUGGESTIONS = 25;

export interface RetrievableCrewFormDialogProps {
  open: boolean;
  mode: 'add' | 'edit';
  // Required (non-null) when mode === 'edit'; ignored in 'add' mode.
  initialEntry: RetrievableCrewEntry | null;
  catalog: CatalogEntry[];
  polestarCatalog: PolestarCatalogEntry[];
  // Archetype IDs already tracked by ANY row, including the one being
  // edited — duplicate detection subtracts initialEntry's own id itself.
  trackedArchetypeIds: Set<number>;
  onClose: () => void;
  // Rejecting keeps the dialog open (the caller is expected to have already
  // surfaced the error, e.g. via a Snackbar) — resolving closes it.
  onSubmit: (entry: RetrievableCrewEntry) => Promise<void>;
}

function filterCrewOptions(options: CatalogEntry[], inputValue: string): CatalogEntry[] {
  const query = inputValue.trim().toLowerCase();
  if (query.length < MIN_SEARCH_LENGTH) return [];
  return options.filter((o) => o.name.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS);
}

function RetrievableCrewFormDialog({
  open,
  mode,
  initialEntry,
  catalog,
  polestarCatalog,
  trackedArchetypeIds,
  onClose,
  onSubmit,
}: RetrievableCrewFormDialogProps) {
  const [nameInput, setNameInput] = useState('');
  const [selectedPolestarIds, setSelectedPolestarIds] = useState<number[]>([]);
  const [resolvedArchetypeId, setResolvedArchetypeId] = useState<number | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [polestarError, setPolestarError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // (Re)initialize whenever the dialog opens — covers both a fresh Add and
  // re-opening Edit on a (possibly different) selected row.
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialEntry) {
      const crew = catalog.find((c) => c.archetype_id === initialEntry.archetypeId);
      setNameInput(crew?.name ?? '');
      setSelectedPolestarIds(initialEntry.polestars.filter((id): id is number => id !== null));
      setResolvedArchetypeId(initialEntry.archetypeId);
    } else {
      setNameInput('');
      setSelectedPolestarIds([]);
      setResolvedArchetypeId(null);
    }
    setNameError(null);
    setPolestarError(null);
    setSubmitting(false);
  }, [open, mode, initialEntry, catalog]);

  // Broader than the autocomplete's own suggestion list — includes
  // already-tracked crew, so typing an exact duplicate name still resolves
  // to a real CatalogEntry (letting the "already tracked" check below fire
  // with a specific message, instead of the generic "invalid name" one).
  const eligiblePool = useMemo(() => catalog.filter((c) => c.polestarFilterKeys.length > 0), [catalog]);

  const autocompleteOptions = useMemo(
    () => getEligibleRetrievableCandidates(catalog, trackedArchetypeIds, initialEntry?.archetypeId ?? null),
    [catalog, trackedArchetypeIds, initialEntry]
  );

  const resolvedCrew = useMemo(
    () => eligiblePool.find((c) => c.name.trim().toLowerCase() === nameInput.trim().toLowerCase()) ?? null,
    [eligiblePool, nameInput]
  );

  // Changing to a genuinely different crew than the one the dialog started
  // with invalidates the old Polestar selections (a different crew's
  // eligible pool almost certainly doesn't overlap) — reset rather than try
  // to partially preserve them. We deliberately do NOT null resolvedArchetypeId
  // when resolvedCrew is transiently null (e.g. mid-edit while the typed name
  // doesn't currently match any crew): doing so would make retyping the exact
  // original name look like "a genuinely different crew" and wipe selections
  // that were never actually invalidated. Keeping the last-resolved id means a
  // real change to a different crew still resets correctly, while a transient
  // invalid state followed by restoring the original name does not.
  //
  // POST-REVIEW CORRECTION: an earlier version of this effect had an
  // `else if (!resolvedCrew) { setResolvedArchetypeId(null); }` branch here.
  // The final whole-branch review (2026-08-20) caught that this branch had no
  // purpose except to null the comparison basis on ANY transient invalid
  // input — resolvedArchetypeId is read nowhere else in this file — and that
  // this silently wiped a user's Polestar selections on a simple
  // backspace-then-retype-the-same-character typo in Edit mode. Removed.
  // Fixed directly in the shipped code (commit 2610516); this plan text is
  // corrected to match so no future transcription reintroduces the bug.
  useEffect(() => {
    if (resolvedCrew && resolvedCrew.archetype_id !== resolvedArchetypeId) {
      setSelectedPolestarIds([]);
      setResolvedArchetypeId(resolvedCrew.archetype_id);
    }
  }, [resolvedCrew, resolvedArchetypeId]);

  const eligiblePolestars = useMemo(
    () => (resolvedCrew ? resolveEligiblePolestars(resolvedCrew.polestarFilterKeys, polestarCatalog) : []),
    [resolvedCrew, polestarCatalog]
  );

  function handleNameInputChange(_event: unknown, newValue: string) {
    setNameInput(newValue);
    setNameError(null);
  }

  function togglePolestar(id: number) {
    setSelectedPolestarIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_POLESTARS) return prev; // defensive; the badge is also disabled at this point
      return [...prev, id];
    });
    setPolestarError(null);
  }

  async function handleSubmit() {
    const candidate = resolvedCrew;
    let nextNameError: string | null = null;
    if (!candidate) {
      nextNameError = 'Enter a valid crew name.';
    } else if (
      trackedArchetypeIds.has(candidate.archetype_id) &&
      candidate.archetype_id !== initialEntry?.archetypeId
    ) {
      nextNameError = `${candidate.name} is already tracked.`;
    }
    const nextPolestarError = selectedPolestarIds.length === 0 ? 'Select at least 1 Polestar.' : null;

    setNameError(nextNameError);
    setPolestarError(nextPolestarError);
    if (nextNameError || nextPolestarError || !candidate) return;

    const polestars: (number | null)[] = Array.from({ length: MAX_POLESTARS }, (_, i) => selectedPolestarIds[i] ?? null);
    setSubmitting(true);
    try {
      await onSubmit({ archetypeId: candidate.archetype_id, polestars });
      onClose();
    } catch {
      // Caller already surfaced the failure (e.g. a Snackbar) — keep the
      // dialog open with the user's input intact so they can retry.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{mode === 'add' ? 'Add Retrievable Crew' : 'Edit Retrievable Crew'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Autocomplete<CatalogEntry, false, false, true>
            freeSolo
            options={autocompleteOptions}
            getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
            filterOptions={(options, state) => filterCrewOptions(options, state.inputValue)}
            inputValue={nameInput}
            onInputChange={handleNameInputChange}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Crew name"
                autoFocus
                error={nameError !== null}
                helperText={nameError ?? 'Type at least 3 characters to search'}
              />
            )}
          />
          {resolvedCrew ? (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Polestars (choose up to {MAX_POLESTARS})
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                  p: 1,
                  border: polestarError ? '1px solid' : 'none',
                  borderColor: 'error.main',
                  borderRadius: 1,
                }}
              >
                {eligiblePolestars.map((entry) => {
                  const selected = selectedPolestarIds.includes(entry.id);
                  return (
                    <PolestarBadge
                      key={entry.id}
                      entry={entry}
                      selected={selected}
                      disabled={!selected && selectedPolestarIds.length >= MAX_POLESTARS}
                      onClick={() => togglePolestar(entry.id)}
                    />
                  );
                })}
              </Box>
              {polestarError && (
                <Typography variant="caption" color="error">
                  {polestarError}
                </Typography>
              )}
            </Box>
          ) : (
            <Typography color="text.secondary">Type a crew name to see its eligible Polestars.</Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default RetrievableCrewFormDialog;
```

- [ ] **Step 3: Replace `client/src/pages/RetrievableCrewPage.tsx`** (wires Add/Edit for real, starting from Task 4's version)

```tsx
import { useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { usePolestarCatalog } from '../hooks/usePolestarCatalog';
import { useRetrievableCrew } from '../hooks/useRetrievableCrew';
import { getCrewList } from '../crew/getters';
import { getCollectionsList } from '../collections/getters';
import { buildRetrievableCrewRows, buildPolestarCatalogMap } from '../polestars/getters';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import RetrievableCrewTable from '../polestars/RetrievableCrewTable';
import RetrievableCrewActions from '../polestars/RetrievableCrewActions';
import RetrievableCrewFormDialog from '../polestars/RetrievableCrewFormDialog';
import DeleteConfirmDialog from '../polestars/DeleteConfirmDialog';
import PageShell from '../layout/PageShell';

type DialogMode = 'add' | 'edit' | null;

function RetrievableCrewPage() {
  const { data: playerData, loading: playerLoading } = usePlayerData();
  const { data: catalog, loading: catalogLoading } = useCrewCatalog();
  const { data: polestarCatalog, loading: polestarCatalogLoading } = usePolestarCatalog();
  const {
    data: retrievableCrew,
    loading: retrievableCrewLoading,
    error,
    refresh,
    addEntry,
    updateEntry,
    deleteEntry,
  } = useRetrievableCrew();

  const [selectedArchetypeId, setSelectedArchetypeId] = useState<number | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [formInitialEntry, setFormInitialEntry] = useState<RetrievableCrewEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RetrievableCrewEntry | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  const loading = playerLoading || catalogLoading || polestarCatalogLoading || retrievableCrewLoading;
  const loaded = !loading && !error && !!retrievableCrew;

  const crewList = playerData ? getCrewList(playerData) : [];
  const collections = playerData ? getCollectionsList(playerData) : [];
  const rows = loaded ? buildRetrievableCrewRows(retrievableCrew, catalog ?? [], crewList, collections) : [];
  const polestarCatalogMap = buildPolestarCatalogMap(polestarCatalog ?? []);
  const trackedArchetypeIds = new Set((retrievableCrew ?? []).map((e) => e.archetypeId));

  function crewLabel(archetypeId: number): string {
    return catalog?.find((c) => c.archetype_id === archetypeId)?.name ?? `archetype ${archetypeId}`;
  }

  function handleAddClick() {
    setFormInitialEntry(null);
    setDialogMode('add');
  }

  function handleEditClick() {
    const entry = retrievableCrew?.find((e) => e.archetypeId === selectedArchetypeId) ?? null;
    if (!entry) return;
    setFormInitialEntry(entry);
    setDialogMode('edit');
  }

  function handleDialogClose() {
    setDialogMode(null);
    setFormInitialEntry(null);
  }

  async function handleFormSubmit(entry: RetrievableCrewEntry) {
    const label = crewLabel(entry.archetypeId);
    try {
      if (dialogMode === 'edit' && formInitialEntry) {
        await updateEntry(formInitialEntry.archetypeId, entry);
        setSnackbar({ severity: 'success', message: `Updated ${label}.` });
      } else {
        await addEntry(entry);
        setSnackbar({ severity: 'success', message: `Added ${label}.` });
      }
      setSelectedArchetypeId(null);
    } catch (err) {
      setSnackbar({
        severity: 'error',
        message: err instanceof Error ? err.message : 'Failed to save retrievable crew',
      });
      throw err;
    }
  }

  function handleDeleteClick() {
    const entry = retrievableCrew?.find((e) => e.archetypeId === selectedArchetypeId) ?? null;
    if (entry) setDeleteTarget(entry);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const label = crewLabel(deleteTarget.archetypeId);
    setDeleteSubmitting(true);
    try {
      await deleteEntry(deleteTarget.archetypeId);
      setSnackbar({ severity: 'success', message: `Deleted ${label}.` });
      setDeleteTarget(null);
      setSelectedArchetypeId(null);
    } catch (err) {
      setSnackbar({ severity: 'error', message: err instanceof Error ? err.message : 'Failed to delete' });
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <>
      <PageShell
        title="Retrievable Crew"
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
        loaded={loaded}
        count={rows.length}
        emptyMessage="No retrievable crew tracked yet."
        titleActions={
          <RetrievableCrewActions
            onAdd={handleAddClick}
            onEdit={handleEditClick}
            onDelete={handleDeleteClick}
            canEdit={selectedArchetypeId !== null}
            canDelete={selectedArchetypeId !== null}
          />
        }
      >
        <RetrievableCrewTable
          rows={rows}
          polestarCatalogMap={polestarCatalogMap}
          selectedArchetypeId={selectedArchetypeId}
          onSelect={setSelectedArchetypeId}
        />
      </PageShell>
      <RetrievableCrewFormDialog
        open={dialogMode !== null}
        mode={dialogMode ?? 'add'}
        initialEntry={formInitialEntry}
        catalog={catalog ?? []}
        polestarCatalog={polestarCatalog ?? []}
        trackedArchetypeIds={trackedArchetypeIds}
        onClose={handleDialogClose}
        onSubmit={handleFormSubmit}
      />
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        crewName={deleteTarget ? crewLabel(deleteTarget.archetypeId) : ''}
        submitting={deleteSubmitting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
      <Snackbar open={snackbar !== null} autoHideDuration={6000} onClose={() => setSnackbar(null)}>
        <Alert severity={snackbar?.severity ?? 'success'} onClose={() => setSnackbar(null)}>
          {snackbar?.message ?? ''}
        </Alert>
      </Snackbar>
    </>
  );
}

export default RetrievableCrewPage;
```

- [ ] **Step 4: Verify — full spec verification plan**

```bash
npx tsc -b client
npx tsc --noEmit -p server
```
Expected: no errors in either.

With both dev servers running and `server/data/*.json` seeded (per Global Constraints — real Minooki Freeman row present, `archetypeId: 26275`), run this full real-browser Playwright pass against `/retrievable-crew`, checking `server/data/retrievable-crew.json` directly after each disk-affecting step (not just the UI):

1. **Add a crew:** click Add, type a real crew name with ≥1 eligible Polestar that isn't already tracked (find one via `curl -s http://127.0.0.1:3001/api/crew-catalog | python3 -c "import json,sys; d=json.load(sys.stdin); print(next(e['name'] for e in d if e['polestarFilterKeys'] and e['archetype_id']!=26275))"`), select 2 Polestars, Submit. Row appears in the table, success Snackbar shown, page refresh preserves the row, disk file has the new entry with the 2 chosen ids in slots 1-2 and `null` in slots 3-4.
2. **Edit Polestars only:** select that new row, click Edit — dialog opens pre-filled with its name and both Polestars already colored. Deselect one, select a different eligible one, Submit. Table updates, disk file reflects the new pair.
3. **Edit the crew itself:** select the same row, click Edit, clear the name field and type a *different* real crew's name (again with ≥1 eligible Polestar, not already tracked). Confirm the Polestar picker's options change to the new crew's pool and all previous selections are gone (grey). Select 1, Submit. The old archetype's row is gone from the table, a new row for the new crew appears with exactly 1 Polestar, disk file's key changed accordingly.
4. **Invalid name:** click Add, type a name that matches no crew (e.g. `"zzz-not-a-real-crew"`). Submit. Red border + "Enter a valid crew name." helper text appear under the field; confirm via the network log that no `POST` request fired.
5. **Duplicate name:** click Add, type the real Minooki Freeman's exact name (already tracked). Confirm the autocomplete dropdown does NOT suggest it, but typing the full exact name still resolves the Polestar picker. Select a Polestar, Submit. Red border + "Minooki Freeman is already tracked." appears; no `POST` fires.
6. **5th Polestar blocked:** click Add, type a real crew name with ≥5 eligible Polestars if one exists (else use a 4+ one), select 4. Confirm the remaining unselected badges are visibly dimmed and clicking one does nothing (selection count stays at 4). Close without submitting (Cancel).
7. **Zero Polestars blocked:** click Add, type a valid non-duplicate crew name, select nothing, Submit. Red outline + "Select at least 1 Polestar." appears under the picker; no `POST` fires.
8. **Delete with confirm:** select the row added in step 3, click Delete, confirm — row removed from table and disk.
9. **Cleanup:** confirm the real Minooki Freeman row (`26275`) is present and unmodified from its original `[14247, 14276, 14431, null]` throughout — if any step above changed it, restore it via `curl -X PUT` before finishing.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must NOT print "main"
git add client/src/polestars/getters.ts client/src/polestars/RetrievableCrewFormDialog.tsx client/src/pages/RetrievableCrewPage.tsx
git commit -m "Add Retrievable Crew Add/Edit form dialog, wire up full CRUD UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2ssW7YoSRbj7g7jkhdzbU"
```
