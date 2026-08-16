# Overview "Missing Favorite Flag" Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Missing Favorite Flag" table to the Overview page, listing owned, non-buyback crew whose in-game "favorite" heart flag is off.

**Architecture:** Single-file-family, single-task change — `CrewMember` type addition, one new filter function, and one new Overview page section that reuses the existing `CrewTable` component (no new table component).

**Tech Stack:** React 19, TypeScript strict mode, MUI, `tsx` (root devDependency, used for throwaway verification scripts — this project has no automated test framework by deliberate choice).

## Global Constraints

- `CrewMember` gains `favorite: boolean` (raw data already has it, just undeclared — safe required-field addition, no `CrewMember` object-literal constructors exist anywhere).
- `filterMissingFavorite(crew) = crew.filter((c) => !c.favorite && !c.in_buy_back_state)` — buyback-state crew excluded, matching this project's established convention (Duplicates page, QPs page).
- The new section reuses `CrewTable` directly (`showCollectionsNames={true}`, `defaultCrewComparator` sort) — no new table component, no new columns.
- The new section is gated on `!loading && !error && identity` only (same as "Player Info"/"Missing Crew recap") — it does **not** depend on the crew catalog, so it must not be nested inside the catalog-gated `showMissingTables` block.
- Positioned immediately after the existing "Missing Crew recap" table and before the `showMissingTables`-gated block.
- Title: "Missing Favorite Flag".
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, same pre-existing warning count as before this feature.
- Full spec: `docs/superpowers/specs/2026-08-16-overview-missing-favorite-flag-design.md`.
- **Real expected output, computed from `server/data/player-cache.json` as of 2026-08-16 — exactly 7 rows, in final sorted order:**

  ```
  1. Beach Day Uhura              level=10 items=-1 collections=5 rarity=4/4
  2. Commander Scott               level=1  items=-4 collections=6 rarity=1/3
  3. Commander Scott               level=1  items=-4 collections=6 rarity=1/3
  4. Commander Scott               level=1  items=-4 collections=6 rarity=1/3
  5. Mirror 'Smiley' O'Brien        level=1  items=-4 collections=5 rarity=1/3
  6. Mirror 'Smiley' O'Brien        level=1  items=-4 collections=5 rarity=1/3
  7. Mirror 'Smiley' O'Brien        level=1  items=-4 collections=5 rarity=1/3
  ```

  If the live data has changed since this plan was written, re-derive independently (see the verification step) rather than expecting a byte-match.

---

### Task 1: `favorite` field, `filterMissingFavorite`, and the new Overview section

**Files:**
- Modify: `client/src/types/crew.ts`
- Modify: `client/src/crew/filters.ts`
- Modify: `client/src/pages/OverviewPage.tsx`

**Interfaces:** None — this is a single self-contained page addition; nothing outside `OverviewPage.tsx` consumes the new filter or computed data.

- [ ] **Step 1: Add `favorite` to `CrewMember` in `client/src/types/crew.ts`**

Replace:

```ts
  q_bits: number;
  in_buy_back_state: boolean;
  skills: Record<string, SkillValue>;
}
```

with:

```ts
  q_bits: number;
  in_buy_back_state: boolean;
  skills: Record<string, SkillValue>;
  favorite: boolean;
}
```

- [ ] **Step 2: Add `filterMissingFavorite` to `client/src/crew/filters.ts`**

Append at the end of the file:

```ts

export function filterMissingFavorite(crew: CrewMember[]): CrewMember[] {
  return crew.filter((c) => !c.favorite && !c.in_buy_back_state);
}
```

- [ ] **Step 3: Extend `client/src/pages/OverviewPage.tsx`'s imports**

Replace:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import { getBaseSkillBonuses, getProficiencyBonuses } from '../lib/skillBuffs';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from '../crew/getters';
import { getArchetypeMaxRarityMap, getCatalogCount, getMissingCrew } from '../catalog/getters';
import { byDataScoreDesc } from '../catalog/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import MissingCrewTable from '../catalog/MissingCrewTable';
import TableSearchBar from '../components/TableSearchBar';
```

with:

```tsx
import { usePlayerData } from '../hooks/usePlayerData';
import { useCrewCatalog } from '../hooks/useCrewCatalog';
import { extractPlayerIdentity } from '../lib/extractPlayerIdentity';
import { getBaseSkillBonuses, getProficiencyBonuses } from '../lib/skillBuffs';
import { getCrewList, getFrozenCrewArchetypeIds, getOwnedArchetypeIds } from '../crew/getters';
import { filterMissingFavorite } from '../crew/filters';
import { defaultCrewComparator, sortCrew } from '../crew/sorters';
import { getArchetypeMaxRarityMap, getCatalogCount, getMissingCrew } from '../catalog/getters';
import { byDataScoreDesc } from '../catalog/sorters';
import { getCollectionsList } from '../collections/getters';
import { useSearch } from '../lib/useSearch';
import CrewTable from '../crew/CrewTable';
import MissingCrewTable from '../catalog/MissingCrewTable';
import TableSearchBar from '../components/TableSearchBar';
```

- [ ] **Step 4: Compute the new crew list and its search hook**

Replace:

```tsx
  const collectionsList = data ? getCollectionsList(data) : [];
  const baseSkillBonuses = data ? getBaseSkillBonuses(data) : [];
  const proficiencyBonuses = data ? getProficiencyBonuses(data) : [];
```

with:

```tsx
  const collectionsList = data ? getCollectionsList(data) : [];
  const missingFavoriteCrew = data
    ? sortCrew(filterMissingFavorite(crewList), defaultCrewComparator(collectionsList))
    : [];
  const missingFavoriteSearch = useSearch(missingFavoriteCrew, (c) => [c.name]);
  const baseSkillBonuses = data ? getBaseSkillBonuses(data) : [];
  const proficiencyBonuses = data ? getProficiencyBonuses(data) : [];
```

- [ ] **Step 5: Add the new section's JSX, between "Missing Crew recap" and the `showMissingTables` block**

Replace:

```tsx
        </TableContainer>
      )}

      {showMissingTables && (
        <>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5">
              Missing 4 Stars (In Portal) ({inPortalSearch.filteredItems.length} of {missingInPortal.length})
            </Typography>
```

with:

```tsx
        </TableContainer>
      )}

      {!loading && !error && identity && (
        <>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5">
              Missing Favorite Flag ({missingFavoriteSearch.filteredItems.length} of {missingFavoriteCrew.length})
            </Typography>
            <TableSearchBar
              value={missingFavoriteSearch.query}
              onChange={missingFavoriteSearch.setQuery}
              ariaLabel="Search Missing Favorite Flag by name"
            />
          </Stack>
          {missingFavoriteSearch.active && missingFavoriteSearch.filteredItems.length === 0 ? (
            <Typography color="text.secondary">No results found for your search.</Typography>
          ) : (
            <CrewTable crew={missingFavoriteSearch.filteredItems} collections={collectionsList} showCollectionsNames={true} />
          )}
        </>
      )}

      {showMissingTables && (
        <>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="h5">
              Missing 4 Stars (In Portal) ({inPortalSearch.filteredItems.length} of {missingInPortal.length})
            </Typography>
```

(This is a pure insertion — the `{showMissingTables && (...)}` block and everything inside/after it is otherwise untouched; the "Replace with" text above ends with the identical opening lines the "Replace" text started with, just with the new section inserted before them.)

- [ ] **Step 6: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, same pre-existing warning count as before this feature.

- [ ] **Step 7: Data-driven verification against the real, live-refreshed `server/data/player-cache.json`**

Write a throwaway script at the repo root, `verify-missing-favorite.ts` (not committed — delete it after capturing output), using `tsx` (already a root devDependency):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList } from './client/src/crew/getters';
import { filterMissingFavorite } from './client/src/crew/filters';
import { defaultCrewComparator, sortCrew } from './client/src/crew/sorters';
import { getCollectionsList } from './client/src/collections/getters';

const data = JSON.parse(readFileSync('server/data/player-cache.json', 'utf-8'));
const crewList = getCrewList(data);
const collections = getCollectionsList(data);

const missing = sortCrew(filterMissingFavorite(crewList), defaultCrewComparator(collections));
console.log('count:', missing.length);
missing.forEach((c, i) => console.log(`${i + 1}. ${c.name} (level=${c.level}, rarity=${c.rarity}/${c.max_rarity})`));
```

Run: `npx tsx verify-missing-favorite.ts` (from the repo root).

**Expected output, computed from the real file as of 2026-08-16 — confirm your run matches exactly:**

```
count: 7
1. Beach Day Uhura (level=10, rarity=4/4)
2. Commander Scott (level=1, rarity=1/3)
3. Commander Scott (level=1, rarity=1/3)
4. Commander Scott (level=1, rarity=1/3)
5. Mirror 'Smiley' O'Brien (level=1, rarity=1/3)
6. Mirror 'Smiley' O'Brien (level=1, rarity=1/3)
7. Mirror 'Smiley' O'Brien (level=1, rarity=1/3)
```

If your run's data file has since changed (the user may have refreshed with newer live data, or flagged/unflagged crew since this plan was written), the important thing is that your run's output genuinely reflects `favorite === false && in_buy_back_state === false` crew from a manual read of `server/data/player-cache.json` — not that it byte-matches the list above. State explicitly in your report whether your run matched exactly or differed (and why, if you can tell).

Delete the throwaway script once you've captured its output in your report.

- [ ] **Step 8: Real-browser verification**

The real, live-refreshed `server/data/player-cache.json` should already be seeded in this worktree (per this project's established worktree-setup convention). If it's missing, copy it from the main checkout before proceeding.

Start the dev server: `npm run dev` (root). Using the `playwright` library directly (or the `mcp__playwright__*`/`mcp__chrome-devtools__*` MCP tools if available — see `CLAUDE.md`), navigate to `/` (Overview) and:

1. Confirm a new "Missing Favorite Flag" section renders directly between "Missing Crew recap" and "Missing 4 Stars (In Portal)" — with a heading, a count, a search box, and a table.
2. Confirm the section renders even before/without waiting on the crew catalog to finish loading (it should appear as soon as player data loads, not gated behind the same wait as "Missing 4 Stars").
3. Read the actual rendered rows (per-cell reads — do not use a whole-row/concatenated text extraction) and confirm exactly 7 rows, in order, matching Step 7's script output (or, if live data has changed, whichever rows actually appear — cross-check against a manual read of `server/data/player-cache.json` in that case).
4. Confirm the table's columns match the standard owned-crew set (`#`, Image, Stars, Name, Level, Items to equip, Total collections, Collections names) — i.e., the same shape as "5 Stars Crew", not "Missing 4 Stars (In Portal)"'s catalog-oriented columns.
5. Type a partial name into the new section's search box (e.g. "Scott") and confirm it filters to just the matching rows, independent of the other search boxes on the page.
6. Confirm the rest of the page (Player Info, Missing Crew recap, Missing 4 Stars tables, Base Skill Bonus, Proficiency Bonus) still renders correctly — no regression.

Stop the dev server afterward (kill only the process this step started — confirm ownership via the working-directory/port before killing anything if a port conflict comes up; if the port is already occupied by the user's own separately-running dev server, do not kill it — run on an alternate port instead, same as established practice on this project).

- [ ] **Step 9: Commit**

```bash
git add client/src/types/crew.ts client/src/crew/filters.ts client/src/pages/OverviewPage.tsx
git commit -m "Add Missing Favorite Flag table to Overview page"
```
