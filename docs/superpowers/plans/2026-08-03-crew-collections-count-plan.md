# Crew Collections Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Collections" column (count of collections each crew member belongs to) to all four existing crew pages, plus a new `byCollectionCountDesc` sort key inserted between equipment-slots and name in the existing sort priority.

**Architecture:** New `collections/` module (mirroring the existing `crew/` module's shape) computes crew→collection membership via one predicate function, `crewBelongsToCollection`, reused directly by a crew's-eye-view getter now and — unmodified — by a collection's-eye-view getter in a future page (not built in this plan). `CrewTable` and `sorters.ts` are extended to take a `collections: Collection[]` list as context, the same way Immortalization already threads an `items: OwnedItem[]` list through. Two tasks: the data layer (types/getters, verified against real data) first, then the table/sorter/page wiring on top of it — table and pages are combined into one task because `CrewTable`'s new `collections` prop is required, so splitting them would leave the build red between tasks.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, no new dependencies.

## Global Constraints

- Membership rule (`crewBelongsToCollection`): `collection.traits` intersects `crew.traits ∪ crew.traits_hidden`, **OR** `crew.archetype_id` appears in `collection.extra_crew`. Verified against real data: Beach Day Ransom (`archetype_id: 31595`) matches exactly 8 collections — 7 by trait, 1 ("Perils in Paradise") only via `extra_crew`.
- `extra_crew` entries are `archetype_id`s (the crew *type*, shared across players), never the per-owned-instance `id`. Do not confuse the two.
- Dedup is a non-issue by construction — membership filters the single `collections` array with an OR'd predicate, so a collection can't appear twice in a result regardless of which rule(s) matched.
- `Collection` type stays narrow: only `id`, `name`, `traits`, `extra_crew` — no `image`/`description`/`progress`/`milestone` (unused by this feature or its planned successor).
- `CrewMember` gains `archetype_id: number`, `traits: string[]`, `traits_hidden: string[]`.
- All new getters guard optional/malformed data the same way `getMissingEquipmentArchetypeIds` guards `equipment_slots` — `?? []` on every field read off an unvalidated cast, fail closed (missing data contributes zero matches, never throws).
- "Collections" column is added **last**, after "Items to equip", right-aligned like the other numeric columns.
- Sort priority across all 4 pages becomes: `byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc` — collection count inserted third, immediately before the name tiebreaker.
- `byCollectionCountDesc` is a **factory** (`(collections: Collection[]) => Comparator<CrewMember>`), the first one in `sorters.ts` — every other comparator stays a plain `(a, b) => number` since only collection count needs external context.
- No precomputed `Map<archetype_id, count>` — computing membership inline is fast enough at this data scale (597 crew × 88 collections); this project has repeatedly deferred that kind of optimization until it's actually needed.
- No changes to `StarRating`, `getCrewList`, `filterByRarity`, `filterReadyToImmortalize`, `filterNeedsWork`, or any existing comparator's signature.
- No new routes, nav entries, or pages — this plan only touches the 4 existing crew pages.
- TypeScript strict mode stays on; no new dependencies.
- No test framework — verification via type-check, lint, a throwaway data-driven verification script (Task 1) against the real `example-data.json`, and manual dev-server checks (Task 2).

---

### Task 1: Collection type, `CrewMember` fields, and the `collections/` module

**Files:**
- Create: `client/src/types/collection.ts`
- Modify: `client/src/types/crew.ts`
- Create: `client/src/collections/getters.ts`

**Interfaces:**
- Consumes: `PlayerData` (`client/src/types/player.ts`, pre-existing, unchanged), `CrewMember` (`client/src/types/crew.ts`, extended by this task), `getCrewList` (`client/src/crew/getters.ts`, pre-existing, unchanged).
- Produces: `Collection` type (`{ id: number; name: string; traits: string[]; extra_crew: number[] }`). `getCollectionsList(data: PlayerData): Collection[]`, `crewBelongsToCollection(crew: CrewMember, collection: Collection): boolean`, `getCrewCollections(crew: CrewMember, collections: Collection[]): Collection[]`, `getCollectionCount(crew: CrewMember, collections: Collection[]): number` — all new exports from `client/src/collections/getters.ts`. Task 2 imports `Collection`, `getCollectionsList`, and `getCollectionCount` from here.

- [ ] **Step 1: Create `client/src/types/collection.ts`**

```ts
export interface Collection {
  id: number;
  name: string;
  traits: string[];
  extra_crew: number[];
}
```

- [ ] **Step 2: Add `archetype_id`, `traits`, `traits_hidden` to `CrewMember` in `client/src/types/crew.ts`**

Change:

```ts
export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  rarity: number;
  max_rarity: number;
  level: number;
  equipment: [number, number][];
  equipment_slots: { level: number; archetype: number }[];
}
```

to:

```ts
export interface CrewMember {
  id: number;
  symbol: string;
  name: string;
  short_name: string;
  archetype_id: number;
  rarity: number;
  max_rarity: number;
  level: number;
  equipment: [number, number][];
  equipment_slots: { level: number; archetype: number }[];
  traits: string[];
  traits_hidden: string[];
}
```

- [ ] **Step 3: Create `client/src/collections/getters.ts`**

```ts
import type { PlayerData } from '../types/player';
import type { Collection } from '../types/collection';
import type { CrewMember } from '../types/crew';

export function getCollectionsList(data: PlayerData): Collection[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const collections = character?.cryo_collections;
  return Array.isArray(collections) ? (collections as Collection[]) : [];
}

export function crewBelongsToCollection(crew: CrewMember, collection: Collection): boolean {
  const crewTraits = new Set([...(crew.traits ?? []), ...(crew.traits_hidden ?? [])]);
  const collectionTraits = collection.traits ?? [];
  const extraCrew = collection.extra_crew ?? [];
  return collectionTraits.some((trait) => crewTraits.has(trait)) || extraCrew.includes(crew.archetype_id);
}

export function getCrewCollections(crew: CrewMember, collections: Collection[]): Collection[] {
  return collections.filter((collection) => crewBelongsToCollection(crew, collection));
}

export function getCollectionCount(crew: CrewMember, collections: Collection[]): number {
  return getCrewCollections(crew, collections).length;
}
```

- [ ] **Step 4: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/collections/__verify.ts` (deleted in Step 5, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList } from '../crew/getters';
import { getCollectionsList, getCrewCollections, getCollectionCount } from './getters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);
const collections = getCollectionsList(raw);
console.log('total crew:', crew.length, 'total collections:', collections.length);

const beachDayRansom = crew.find((c) => c.symbol === 'ransom_beach_day_crew');
if (beachDayRansom) {
  const matched = getCrewCollections(beachDayRansom, collections);
  console.log('Beach Day Ransom collection count:', matched.length);
  console.log('Beach Day Ransom collections:', matched.map((c) => c.name).sort());
}

const distribution: Record<number, number> = {};
for (const c of crew) {
  const count = getCollectionCount(c, collections);
  distribution[count] = (distribution[count] ?? 0) + 1;
}
console.log('distribution:', distribution);
console.log('max collections:', Math.max(...crew.map((c) => getCollectionCount(c, collections))));

const archetypeCounts: Record<number, number> = {};
for (const c of crew) {
  archetypeCounts[c.archetype_id] = (archetypeCounts[c.archetype_id] ?? 0) + 1;
}
const dupArchetypeId = Object.entries(archetypeCounts).find(([, n]) => n > 1)?.[0];
if (dupArchetypeId) {
  const owners = crew.filter((c) => String(c.archetype_id) === dupArchetypeId);
  console.log('duplicate archetype_id counts match:', owners.map((c) => getCollectionCount(c, collections)));
}
```

Run from the **repo root**: `npx tsx client/src/collections/__verify.ts`

Expected output:
- `total crew: 597 total collections: 88`
- `Beach Day Ransom collection count: 8`
- `Beach Day Ransom collections: [ 'Animated', 'As Usual', 'Deep Cover', 'Joyful Times', 'Perils in Paradise', 'Primal Instinct', 'Ruthless Aggression', 'To Boldly Go' ]`
- `distribution: { '0': 8, '1': 23, '2': 76, '3': 135, '4': 155, '5': 112, '6': 56, '7': 21, '8': 9, '9': 1, '11': 1 }`
- `max collections: 11`
- `duplicate archetype_id counts match: [ 2, 2 ]`

If any of these don't match, do not proceed — re-check the membership logic against the real data structure before moving on.

- [ ] **Step 5: Delete the throwaway verification script**

```bash
rm client/src/collections/__verify.ts
```

- [ ] **Step 6: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/types/collection.ts client/src/types/crew.ts client/src/collections/getters.ts
git commit -m "Add Collection type and crew-collection membership logic"
```

---

### Task 2: Collections column, sort key, and page wiring

**Files:**
- Modify: `client/src/crew/CrewTable.tsx`
- Modify: `client/src/crew/sorters.ts`
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFiveStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewReadyPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewPage.tsx`

**Interfaces:**
- Consumes: `Collection`, `getCollectionsList`, `getCollectionCount` (`client/src/collections/getters.ts`, Task 1) — plus pre-existing `usePlayerData`, `getCrewList`, `getOwnedItems`, `filterByRarity`, `filterReadyToImmortalize`, `filterNeedsWork`, `byLevelDesc`, `byEquipmentSlotsRemainingDesc`, `byNameAsc`, `combineComparators`, `sortCrew`, all unchanged.
- Produces: `byCollectionCountDesc(collections: Collection[]): Comparator<CrewMember>` — new export from `client/src/crew/sorters.ts`. `CrewTable`'s `CrewTableProps` gains a required `collections: Collection[]` field.

- [ ] **Step 1: Modify `client/src/crew/CrewTable.tsx`**

Replace the full file contents with:

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining } from './getters';
import { getCollectionCount } from '../collections/getters';
import StarRating from './StarRating';

export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
}

function CrewTable({ crew, collections }: CrewTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Items to equip</TableCell>
            <TableCell align="right">Collections</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.level}</TableCell>
              <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
              <TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default CrewTable;
```

- [ ] **Step 2: Modify `client/src/crew/sorters.ts`**

Replace the full file contents with:

```ts
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining } from './getters';
import { getCollectionCount } from '../collections/getters';

export type Comparator<T> = (a: T, b: T) => number;

export function combineComparators<T>(...comparators: Comparator<T>[]): Comparator<T> {
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

export function byLevelDesc(a: CrewMember, b: CrewMember): number {
  return b.level - a.level;
}

export function byEquipmentSlotsRemainingDesc(a: CrewMember, b: CrewMember): number {
  return getEquipmentSlotsRemaining(b) - getEquipmentSlotsRemaining(a);
}

export function byCollectionCountDesc(collections: Collection[]): Comparator<CrewMember> {
  return (a, b) => getCollectionCount(b, collections) - getCollectionCount(a, collections);
}

export function byNameAsc(a: CrewMember, b: CrewMember): number {
  return a.name.localeCompare(b.name);
}

export function sortCrew(crew: CrewMember[], comparator: Comparator<CrewMember>): CrewMember[] {
  return [...crew].sort(comparator);
}
```

- [ ] **Step 3: Modify `client/src/pages/ThreeFourStarsCrewPage.tsx`**

Replace the full file contents with:

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';

function ThreeFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">3/4 Stars crew{loaded ? ` (${crew.length})` : ''}</Typography>

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
          <Typography color="text.secondary">No crew at 3/4 stars.</Typography>
        ) : (
          <CrewTable crew={crew} collections={collections} />
        )
      )}
    </Stack>
  );
}

export default ThreeFourStarsCrewPage;
```

- [ ] **Step 4: Modify `client/src/pages/FourFiveStarsCrewPage.tsx`**

Replace the full file contents with:

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList } from '../crew/getters';
import { filterByRarity } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';

function FourFiveStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 5 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">4/5 Stars crew{loaded ? ` (${crew.length})` : ''}</Typography>

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
          <Typography color="text.secondary">No crew at 4/5 stars.</Typography>
        ) : (
          <CrewTable crew={crew} collections={collections} />
        )
      )}
    </Stack>
  );
}

export default FourFiveStarsCrewPage;
```

- [ ] **Step 5: Modify `client/src/pages/FourFourStarsCrewReadyPage.tsx`**

Replace the full file contents with:

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterReadyToImmortalize } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';

function FourFourStarsCrewReadyPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterReadyToImmortalize(
          filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }),
          getOwnedItems(data)
        ),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">4/4 Stars crew (ready){loaded ? ` (${crew.length})` : ''}</Typography>

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
          <Typography color="text.secondary">No crew ready to immortalize at 4/4 stars.</Typography>
        ) : (
          <CrewTable crew={crew} collections={collections} />
        )
      )}
    </Stack>
  );
}

export default FourFourStarsCrewReadyPage;
```

- [ ] **Step 6: Modify `client/src/pages/FourFourStarsCrewPage.tsx`**

Replace the full file contents with:

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { usePlayerData } from '../hooks/usePlayerData';
import { getCrewList, getOwnedItems } from '../crew/getters';
import { filterByRarity, filterNeedsWork } from '../crew/filters';
import { byCollectionCountDesc, byEquipmentSlotsRemainingDesc, byLevelDesc, byNameAsc, combineComparators, sortCrew } from '../crew/sorters';
import { getCollectionsList } from '../collections/getters';
import CrewTable from '../crew/CrewTable';

function FourFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterNeedsWork(
          filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }),
          getOwnedItems(data)
        ),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && data;

  return (
    <Stack spacing={2}>
      <Typography variant="h4">4/4 Stars crew{loaded ? ` (${crew.length})` : ''}</Typography>

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
          <Typography color="text.secondary">No crew at 4/4 stars.</Typography>
        ) : (
          <CrewTable crew={crew} collections={collections} />
        )
      )}
    </Stack>
  );
}

export default FourFourStarsCrewPage;
```

- [ ] **Step 7: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 8: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/api/player` (or your alternate port) — expect the same 502 `UPSTREAM_AUTH_FAILED` JSON as before, confirming nothing in the server/proxy chain is affected by this purely client-side change.

Run: `curl -s http://localhost:5173/` — expect `id="root"` in the response, confirming the client still serves its shell with the updated table/pages compiled in.

Stop both background processes afterward.

- [ ] **Step 9: Commit**

```bash
git add client/src/crew/CrewTable.tsx client/src/crew/sorters.ts client/src/pages/ThreeFourStarsCrewPage.tsx client/src/pages/FourFiveStarsCrewPage.tsx client/src/pages/FourFourStarsCrewReadyPage.tsx client/src/pages/FourFourStarsCrewPage.tsx
git commit -m "Add Collections column and sort key to all crew pages"
```

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open each of the 4 pages and confirm the Collections numbers look right against your own roster, and that sort order matches level → items-to-equip → collections → name.
