# Frozen Duplicates Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new pages, "4 Stars Duplicates" and "5 Stars Duplicates," surfacing active-roster crew whose archetype already has a frozen twin, filtered by `max_rarity`.

**Architecture:** A new `filterFrozenDuplicates` in `crew/filters.ts` (crew-domain-only — takes the frozen-id set as a plain parameter, no import from `collections/`). One parameterized internal page component (`FrozenDuplicatesPage`, taking `maxRarity`/`title` props) reused by two thin page wrappers, matching every other crew page's `usePlayerData` + loading/error/empty/title scaffold and reusing `CrewTable` unmodified. Single task: filter, pages, and nav/route wiring are small and one-directional (pages depend on the filter, nav depends on the pages existing) with no intermediate broken-build risk from splitting, but nothing meaningfully independent to gate separately either.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, react-router-dom, no new dependencies.

## Global Constraints

- **`filterFrozenDuplicates(crew, frozenArchetypeIds, maxRarity)`** — `crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && c.max_rarity === maxRarity)`. No completion-state filtering — every active-roster crew whose archetype is frozen and whose `max_rarity` matches shows up, regardless of the duplicate's own level/equipment/rarity. This was an explicit user decision, not a simplification.
- **Verified against real data, must reproduce exactly:** "4 Stars Duplicates" (sorted with the standard 4-key comparator) returns exactly `['Anxious Kirk', 'Indignant Seven', 'Captain Janeway', 'Martia', 'Duelist Yar']`. "5 Stars Duplicates" returns an empty array (0 crew) — correct and expected in the current sample, not a bug.
- **`FrozenDuplicatesPage` is internal, not directly routed** — it takes `maxRarity: number` and `title: string` props. `FourStarsDuplicatesPage`/`FiveStarsDuplicatesPage` are thin wrappers that each render it with fixed props. This pairing was chosen specifically because the two pages differ by exactly one number — avoids copy-pasting a whole page file, without touching the older 5 pages' still-deferred page-shell duplication (out of scope, unrelated).
- **Reuses `CrewTable` and the standard 4-key sort unmodified** — `combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)`, identical to every other crew page. No new columns, no new sort keys.
- **New routes:** `/4-stars-duplicates` (nav label "4 Stars Duplicates"), `/5-stars-duplicates` (nav label "5 Stars Duplicates"), added alongside the existing 6 nav entries/routes.
- **Empty-state copy:** "No duplicate crew at this rarity." — distinct from every other page's empty-state copy, same `<Typography color="text.secondary">` pattern.
- No changes to `crew/getters.ts`, `crew/sorters.ts`, `collections/getters.ts`, `CrewTable.tsx`, or any of the 5 existing pages (4 crew pages + Collections).
- TypeScript strict mode stays on; no new dependencies.
- No test framework — verification via type-check, lint, a throwaway data-driven verification script against real `example-data.json`, and manual dev-server checks.

---

### Task 1: `filterFrozenDuplicates`, the two pages, and nav/route wiring

**Files:**
- Modify: `client/src/crew/filters.ts`
- Create: `client/src/pages/FrozenDuplicatesPage.tsx`
- Create: `client/src/pages/FourStarsDuplicatesPage.tsx`
- Create: `client/src/pages/FiveStarsDuplicatesPage.tsx`
- Modify: `client/src/layout/AppLayout.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `getCrewList` (`crew/getters.ts`), `getCollectionsList`/`getFrozenCrewArchetypeIds` (`collections/getters.ts`), `byCollectionCountDesc`/`byEquipmentSlotsRemainingDesc`/`byLevelDesc`/`byNameAsc`/`combineComparators`/`sortCrew` (`crew/sorters.ts`), `usePlayerData`, `CrewTable` — all pre-existing, unchanged.
- Produces: `filterFrozenDuplicates(crew: CrewMember[], frozenArchetypeIds: Set<number>, maxRarity: number): CrewMember[]` — new export from `crew/filters.ts`. `FrozenDuplicatesPage` component with `FrozenDuplicatesPageProps { maxRarity: number; title: string }` — new default export from `pages/FrozenDuplicatesPage.tsx`.

- [ ] **Step 1: Add `filterFrozenDuplicates` to `client/src/crew/filters.ts`**

Append this function to the end of the file (keep everything else exactly as-is):

```ts
export function filterFrozenDuplicates(crew: CrewMember[], frozenArchetypeIds: Set<number>, maxRarity: number): CrewMember[] {
  return crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && c.max_rarity === maxRarity);
}
```

- [ ] **Step 2: Create `client/src/pages/FrozenDuplicatesPage.tsx`**

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterFrozenDuplicates } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
import { getCollectionsList, getFrozenCrewArchetypeIds } from '../collections/getters';
import CrewTable from '../crew/CrewTable';

export interface FrozenDuplicatesPageProps {
  maxRarity: number;
  title: string;
}

function FrozenDuplicatesPage({ maxRarity, title }: FrozenDuplicatesPageProps) {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const frozenArchetypeIds = data ? getFrozenCrewArchetypeIds(data) : new Set<number>();
  const crew = data
    ? sortCrew(
        filterFrozenDuplicates(getCrewList(data), frozenArchetypeIds, maxRarity),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{title}{loaded ? ` (${crew.length})` : ''}</Typography>

      {loading && <CircularProgress />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loaded && (
        crew.length === 0 ? (
          <Typography color="text.secondary">No duplicate crew at this rarity.</Typography>
        ) : (
          <CrewTable crew={crew} collections={collections} />
        )
      )}
    </Stack>
  );
}

export default FrozenDuplicatesPage;
```

- [ ] **Step 3: Create `client/src/pages/FourStarsDuplicatesPage.tsx`**

```tsx
import FrozenDuplicatesPage from './FrozenDuplicatesPage';

function FourStarsDuplicatesPage() {
  return <FrozenDuplicatesPage maxRarity={4} title="4 Stars Duplicates" />;
}

export default FourStarsDuplicatesPage;
```

- [ ] **Step 4: Create `client/src/pages/FiveStarsDuplicatesPage.tsx`**

```tsx
import FrozenDuplicatesPage from './FrozenDuplicatesPage';

function FiveStarsDuplicatesPage() {
  return <FrozenDuplicatesPage maxRarity={5} title="5 Stars Duplicates" />;
}

export default FiveStarsDuplicatesPage;
```

- [ ] **Step 5: Add the nav entries in `client/src/layout/AppLayout.tsx`**

Change:

```ts
const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
  { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
  { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
  { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
  { label: 'Collections', path: '/collections' },
];
```

to:

```ts
const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: '3/4 Stars crew', path: '/3-4-stars-crew' },
  { label: '4/5 Stars crew', path: '/4-5-stars-crew' },
  { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready' },
  { label: '4/4 Stars crew', path: '/4-4-stars-crew' },
  { label: 'Collections', path: '/collections' },
  { label: '4 Stars Duplicates', path: '/4-stars-duplicates' },
  { label: '5 Stars Duplicates', path: '/5-stars-duplicates' },
];
```

- [ ] **Step 6: Register the routes in `client/src/App.tsx`**

Replace the file's contents with:

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import AppLayout from './layout/AppLayout';
import OverviewPage from './pages/OverviewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
import FourFiveStarsCrewPage from './pages/FourFiveStarsCrewPage';
import FourFourStarsCrewReadyPage from './pages/FourFourStarsCrewReadyPage';
import FourFourStarsCrewPage from './pages/FourFourStarsCrewPage';
import CollectionsPage from './pages/CollectionsPage';
import FourStarsDuplicatesPage from './pages/FourStarsDuplicatesPage';
import FiveStarsDuplicatesPage from './pages/FiveStarsDuplicatesPage';

function App() {
  return (
    <PlayerDataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/3-4-stars-crew" element={<ThreeFourStarsCrewPage />} />
            <Route path="/4-5-stars-crew" element={<FourFiveStarsCrewPage />} />
            <Route path="/4-4-stars-crew-ready" element={<FourFourStarsCrewReadyPage />} />
            <Route path="/4-4-stars-crew" element={<FourFourStarsCrewPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/4-stars-duplicates" element={<FourStarsDuplicatesPage />} />
            <Route path="/5-stars-duplicates" element={<FiveStarsDuplicatesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PlayerDataProvider>
  );
}

export default App;
```

- [ ] **Step 7: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/crew/__verify.ts` (deleted in Step 8, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList } from './getters';
import { filterFrozenDuplicates } from './filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from './sorters';
import { getCollectionsList, getFrozenCrewArchetypeIds } from '../collections/getters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);
const collections = getCollectionsList(raw);
const frozenArchetypeIds = getFrozenCrewArchetypeIds(raw);

const comparator = combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc);

const fourStar = sortCrew(filterFrozenDuplicates(crew, frozenArchetypeIds, 4), comparator);
console.log('4-star duplicates:', fourStar.map((c) => c.name));

const fiveStar = sortCrew(filterFrozenDuplicates(crew, frozenArchetypeIds, 5), comparator);
console.log('5-star duplicates:', fiveStar.length);
```

Run from the **repo root**: `npx tsx client/src/crew/__verify.ts`

Expected output:
- `4-star duplicates: [ 'Anxious Kirk', 'Indignant Seven', 'Captain Janeway', 'Martia', 'Duelist Yar' ]`
- `5-star duplicates: 0`

If either doesn't match, do not proceed — re-check `filterFrozenDuplicates` and the sort composition against this plan's Global Constraints before moving on.

- [ ] **Step 8: Delete the throwaway verification script**

```bash
rm client/src/crew/__verify.ts
```

- [ ] **Step 9: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 10: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/api/player` (or your alternate port) — expect the same 502 `UPSTREAM_AUTH_FAILED` JSON as before, confirming nothing in the server/proxy chain is affected by this purely client-side change.

Run: `curl -s http://localhost:5173/` — expect `id="root"` in the response, confirming the client still serves its shell with the two new pages/routes compiled in.

Stop both background processes afterward.

- [ ] **Step 11: Commit**

```bash
git add client/src/crew/filters.ts client/src/pages/FrozenDuplicatesPage.tsx client/src/pages/FourStarsDuplicatesPage.tsx client/src/pages/FiveStarsDuplicatesPage.tsx client/src/layout/AppLayout.tsx client/src/App.tsx
git commit -m "Add 4/5 Stars Duplicates pages for frozen-archetype crew"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open both `/4-stars-duplicates` and `/5-stars-duplicates` and confirm the lists match what you expect against your own roster.
