# usePageData Hook + defaultCrewComparator — Design Spec

Closes the "`usePlayerData()`/`loaded` and the default crew-page sort
composition still repeat across pages" deferred backlog item in
`docs/PROJECT_STATE.md`, surfaced by the Page shell extraction feature.

## Goal

Extract two independent, currently-duplicated pieces into shared helpers:
1. `usePlayerData()` + `const loaded = !loading && !error && !!data;` —
   repeated identically across every page that uses `PageShell`.
2. The 5-way crew sort composition `combineComparators(byLevelDesc,
   byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections),
   byNameAsc)` — repeated identically across the 5 pages whose crew list
   is filtered but not otherwise specially sorted.

## Current state (verified directly against the real files, not just the backlog's count)

**10 pages** call `usePlayerData()` and derive a `loaded` boolean for
`PageShell`. **9 of them** share the exact literal
`const loaded = !loading && !error && !!data;`: `FiveStarsCrewPage`,
`ThreeFourStarsCrewPage`, `FourFiveStarsCrewPage`, `FourFourStarsCrewPage`,
`FourFourStarsCrewReadyPage`, `FrozenDuplicatesPage`, `ShipsPage`,
`QPsPage`, `CollectionsPage`. (The backlog's original "7" count predates
`CollectionsPage`'s and `QPsPage`'s current form — verified fresh, not
assumed.)

The 10th, **`FrozenCrewPage`**, has a genuinely different — but still
mechanically composable — shape: a second data source
(`useCrewCatalog()`), with:
```tsx
const loaded = !loading && !catalogLoading && !error && !!data;
// ...
<PageShell loading={loading || catalogLoading} error={error} loaded={loaded} .../>
```
Notably, `catalogError` is deliberately **excluded** from both `loaded`
and the blocking `error` prop — a catalog failure downgrades to an
empty-state message (`emptyMessage={!catalog && catalogError ? ...}`),
not a blocking error. This asymmetry must be preserved exactly.

**5 of the 9** simple-`loaded` pages also share the identical sort:
`ThreeFourStarsCrewPage`, `FourFiveStarsCrewPage`, `FourFourStarsCrewPage`,
`FourFourStarsCrewReadyPage`, `FrozenDuplicatesPage` — matching the
backlog's list exactly. `FiveStarsCrewPage` has a different composition
(`byRarityDesc` instead of `byCollectionCountDesc`) and is correctly
excluded from this half of the refactor.

**`OverviewPage`** is out of scope entirely — no `PageShell`, no simple
`loaded`, a bespoke multi-condition `showMissingTables` boolean that
doesn't match either duplicated pattern.

## Non-goals

- No behavior change anywhere — every page's `loading`/`error`/`loaded`
  values passed to `PageShell`, and every crew list's final sort order,
  must be identical to today.
- No change to `usePlayerData`/`PlayerDataContext` themselves.
- No change to `OverviewPage` — its condition is genuinely bespoke, not
  duplicated boilerplate.
- No change to `FiveStarsCrewPage`'s sort (it doesn't match the 5-way
  composition) — it still gets `usePageData()` but keeps its own
  `combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc,
  byRarityDesc, byNameAsc)` untouched.
- `usePageData`'s `extraLoading` parameter is a plain optional `boolean`,
  not a generic options object — `FrozenCrewPage` is the only caller that
  will ever need it; no speculative extensibility beyond what's used.

## Design

### `client/src/hooks/usePageData.ts` (new)

```ts
import { usePlayerData } from './usePlayerData';
import type { PlayerData } from '../types/player';

export interface UsePageDataResult {
  data: PlayerData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loaded: boolean;
}

export function usePageData(extraLoading = false): UsePageDataResult {
  const { data, loading, error, refresh } = usePlayerData();
  const combinedLoading = loading || extraLoading;
  const loaded = !combinedLoading && !error && !!data;
  return { data, loading: combinedLoading, error, refresh, loaded };
}
```

Placed in `hooks/` (not `lib/`) — matching this codebase's established
reasoning for that split (`docs/PROJECT_STATE.md`'s "Table pagination"
deep-dive): `hooks/` is for the app's data-fetching sources of truth,
`lib/` for domain-neutral UI-state logic with no fetch/context
involvement. `usePageData` directly wraps `usePlayerData`, a fetch hook —
it belongs beside it.

`loading` returned already folds in `extraLoading`, so a caller never
needs to write `loading={loading || catalogLoading}` itself — it just
passes the hook's own `loading` straight to `PageShell`. `error` is
untouched, passed through from `usePlayerData()` alone — deliberately,
so `FrozenCrewPage`'s existing choice to keep `catalogError` out of the
blocking path is preserved without the hook knowing anything about
catalogs specifically.

**Proof the `FrozenCrewPage` case is unchanged:** calling
`usePageData(catalogLoading)` computes
`loaded = !(loading || catalogLoading) && !error && !!data`, which by De
Morgan's law is identical to today's
`!loading && !catalogLoading && !error && !!data`. Every other page calls
`usePageData()` with no argument, where `extraLoading` defaults to
`false` and `combinedLoading` collapses to plain `loading` — identical to
today's `!loading && !error && !!data`.

### `client/src/crew/sorters.ts` — one new export

```ts
export function defaultCrewComparator(collections: Collection[]): Comparator<CrewMember> {
  return combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc);
}
```

Named in camelCase to match this file's existing comparator-factory
convention (`byCollectionCountDesc(collections)`, `byTierAsc(items)`,
etc.) — the backlog's literal `DEFAULT_CREW_COMPARATOR` casing doesn't
fit alongside those and is not carried over. It's a composition of 4
existing comparators, not a new single-criterion one, so it's
deliberately not named `by*` (that prefix is reserved for atomic
criteria elsewhere in this file).

### Per-page changes

**The 4 pages needing only `usePageData` (no comparator change):**
`FiveStarsCrewPage`, `ShipsPage`, `QPsPage`, `CollectionsPage` — replace
```tsx
const { data, loading, error, refresh } = usePlayerData();
// ...
const loaded = !loading && !error && !!data;
```
with
```tsx
const { data, loading, error, refresh, loaded } = usePageData();
```
and swap the `usePlayerData` import for `usePageData`
(`../hooks/usePageData`).

**The 5 pages needing both:** `ThreeFourStarsCrewPage`,
`FourFiveStarsCrewPage`, `FourFourStarsCrewPage`,
`FourFourStarsCrewReadyPage`, `FrozenDuplicatesPage` — the same
`usePageData()` swap above, **plus** replacing
```tsx
combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
```
with
```tsx
defaultCrewComparator(collections)
```
and dropping the now-unused `byLevelDesc`/`byEquipmentSlotsRemainingDesc`/
`byCollectionCountDesc`/`byNameAsc` imports from `../crew/sorters` and the
now-unused `combineComparators` import from `../lib/comparator`, adding
`defaultCrewComparator` to each page's existing `../crew/sorters` import
line instead (which already imports `sortCrew` from there too — that one
stays, since every page still calls `sortCrew(filteredCrew,
defaultCrewComparator(collections))`).

**`FrozenCrewPage` (its own case):** reorder so `useCrewCatalog()` runs
before `usePageData`, then pass `catalogLoading` in:
```tsx
const { data: catalog, loading: catalogLoading, error: catalogError } = useCrewCatalog();
const { data, loading, error, refresh, loaded } = usePageData(catalogLoading);
```
`<PageShell loading={loading} .../>` now uses the hook's already-combined
`loading` directly — the explicit `loading={loading || catalogLoading}`
in the JSX is no longer needed since `usePageData` did that composition.
`error`/`emptyMessage`/`catalogError` handling stays exactly as today.

## Testing / verification plan

No automated test framework exists in this project (deliberate, repeated
choice). Verification:

- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean — particular attention to unused-import lint errors in any of
  the 10 touched page files (a sign an old comparator/hook import wasn't
  fully dropped).
- Real-browser check across a representative subset: at least one page
  from each row of the table above (a `usePageData`-only page, e.g.
  `/collections`; one of the 5 comparator pages, e.g. `/3-4-stars-crew`,
  confirming sort order is unchanged — same crew in the same order as
  before; and `/5-4-stars-frozen-crew` specifically, confirming its
  loading/error/empty-state behavior is byte-identical to today,
  including the catalog-error-downgrades-to-message case if it can be
  triggered).
- Confirm no route shows a permanent loading spinner or a blocking error
  where today it wouldn't (the exact risk `usePageData`'s `extraLoading`
  composition exists to avoid getting wrong).
