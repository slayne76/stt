# Dilemmas: ship rewards + ship catalog — Design

**Date:** 2026-08-18
**Status:** Approved

## Problem

Every dilemma reward so far has been a crew member, resolved against the existing crew catalog (`CatalogEntry[]`, sourced from `https://datacore.app/structured/crew.json`) — deliberately *not* the player's owned crew, since a reward crew member is very plausibly one the player doesn't own yet. The next dilemma, "Blow by Blow" → "Friends in Need", rewards a **ship** ("Borg Cube") instead. Unlike crew, this app has no ship catalog — the only ship data anywhere is `player.character.ships` (the current player's *owned* ships), which is the wrong data source for the same reason player-owned crew would be wrong for crew rewards: it depends on what the current player happens to own, not on what the reward actually is.

## Investigation

`https://datacore.app/structured/ship_schematics.json` (same host as the crew catalog) is a genuine, ownership-independent ship catalog: 127 entries, each wrapping a `ship` object with `archetype_id`, `name`, `icon: { file }` (the same `DatacoreAsset` shape already used for owned-ship icons in `ShipsTable.tsx`), `rarity`, and more. Confirmed it includes the needed entry:

```json
{ "archetype_id": 2819, "name": "Borg Cube", "icon": { "file": "/ship_previews/borg_cube" } }
```

This is structurally analogous to the crew catalog, so the same architecture applies: a small server-side proxy/cache, a client-side context, and reward resolution by `archetype_id` — independent of player ownership.

## Design

### Reward schema: crew vs. ship discriminant

`Reward` gains a required `type: 'crew' | 'ship'` field. A bare shared numeric ID is **not** safe — crew and ship `archetype_id`s are independent numeric spaces that could collide — so the type tag is required, not optional convenience.

```ts
export type Reward =
  | { type: 'crew'; crewArchetypeId: number; dropRatePercent: number; showName: boolean }
  | { type: 'ship'; shipArchetypeId: number; dropRatePercent: number; showName: boolean };
```

All 52 existing `Reward` objects across `dilemmas.json` gain `"type": "crew"` (mechanical, no behavior change — every existing reward is a crew reward; 52, not 17 or so, because the two reward pools — Lost Among the Stars, The Buried Years×2 — each expand to 11 individual `Reward` objects).

### Server: ship catalog (mirrors the crew catalog exactly)

- `server/src/shipCatalogClient.ts` — `fetchShipCatalog(): Promise<ShipCatalogEntry[]>`, fetching `https://datacore.app/structured/ship_schematics.json` and mapping each entry's nested `ship` object to:
  ```ts
  export interface ShipCatalogEntry {
    archetype_id: number;
    name: string;
    icon: { file: string };
    rarity: number;
  }
  ```
- `server/src/shipCatalogCache.ts` — same 24h-TTL file-cache pattern as `catalogCache.ts` (`readShipCatalogCache`/`writeShipCatalogCache`/`isShipCatalogCacheFresh`), cache file at `data/ship-catalog-cache.json` (already covered by the existing gitignored `server/data/` pattern).
- `server/src/routes/shipCatalog.ts` — `GET /api/ship-catalog` (serve fresh cache, else fetch live and cache, falling back to stale cache on a live-fetch failure) + `POST /api/ship-catalog/refresh` (always fetch live, no stale-cache fallback) — identical shape to `routes/catalog.ts`, registered in `index.ts` alongside the other routers.

### Client: ship catalog (mirrors the crew catalog exactly)

- `client/src/types/shipCatalogEntry.ts` — the `ShipCatalogEntry` interface (client-side mirror, same as `CatalogEntry`'s existing duplication convention).
- `client/src/api/shipCatalogApi.ts` — `fetchShipCatalog()`/`refreshShipCatalog()`.
- `client/src/context/ShipCatalogContext.tsx` + `client/src/hooks/useShipCatalog.ts` — same `{ data, loading, error, refresh }` shape as `CrewCatalogContext`/`useCrewCatalog`, `refresh` taking a `fetcher` param (this one *does* have a `POST /refresh` endpoint, unlike `DilemmasContext`).
- Mounted in `App.tsx` innermost, alongside `CrewCatalogProvider`/`DilemmasProvider` (order among these three doesn't matter — none has the citation-priorities-style latency concern).

### Refresh wiring

- `RefreshControl.tsx`: the `'catalog'` option's label changes from **"Refresh catalog"** to **"Refresh catalogs"**. Its handler now fires crew-catalog and ship-catalog refresh together via `Promise.allSettled([onRefreshCatalog(), onRefreshShipCatalog()])`. New prop `shipCatalogRefreshing: boolean` + `onRefreshShipCatalog: () => Promise<void>`, folded into the existing `isRefreshing` computation for both the `'catalog'` and `'all'` selections.
- `AppLayout.tsx`: wires `useShipCatalog()`'s `refresh`/`loading`/`error` into the new props, and gets a ship-catalog-error `Snackbar`, same pattern as the existing crew-catalog-error one.

### Dilemmas reward rendering

`DilemmasTable.tsx`'s `RewardCell` branches per reward's `type`:
- `type: 'crew'` — unchanged: `catalogMap.get(crewArchetypeId)`, `<Thumbnail url={ASSET_BASE_URL + '/' + entry.imageUrlPortrait} />`.
- `type: 'ship'` — new: `shipCatalogMap.get(shipArchetypeId)`, `<Thumbnail asset={entry.icon} />` (the `DatacoreAsset`-accepting form of `Thumbnail`, exactly as `ShipsTable.tsx` already uses for owned-ship icons — no new asset-resolution logic needed). Falls back to the same placeholder-box + `#<archetypeId>` label pattern as an unresolved crew reward when the catalog entry is missing.

`DilemmasTable` gains a `shipCatalogMap: Map<number, ShipCatalogEntry>` prop, alongside the existing `catalogMap`. `DilemmasPage` builds it via a new `buildShipCatalogEntryMap` getter (mirrors `buildCatalogEntryMap`) from `useShipCatalog()`'s data, folds `shipCatalogLoading`/`shipCatalogError` into the page's combined loading state the same way `catalogLoading` already is (ship-catalog failure is non-fatal, same as crew-catalog failure today).

### New data

Appended to `server/src/data/dilemmas.json`:

```json
{
  "id": "blow-by-blow",
  "name": "Blow by Blow",
  "chainName": "Blow by Blow",
  "partNumber": 1,
  "choices": [
    { "letter": "A", "description": "Protect the Andorian by stunning the Gorn.", "leadsToDilemmaId": "friends-in-need" },
    { "letter": "B", "description": "Protect the Gorn by stunning the Andorian." }
  ]
},
{
  "id": "friends-in-need",
  "name": "Friends in Need",
  "chainName": "Blow by Blow",
  "partNumber": 2,
  "choices": [
    { "letter": "A", "description": "Negotiate with the guards for freedom." },
    { "letter": "B", "description": "Ask the Andorian we rescued to distract the guards.", "rewards": [{ "type": "ship", "shipArchetypeId": 2819, "dropRatePercent": 100, "showName": true }] },
    { "letter": "C", "description": "Ask the Gorn we rescued to fight the guards." }
  ]
}
```

## Non-goals

- No change to the crew catalog, crew reward rendering, or any existing dilemma's data beyond the mechanical `"type": "crew"` addition.
- No change to the choice-icon rule, chain-boundary divider, or Drop Rate collapsing logic — a ship reward is just another reward for those purposes (a reward-bearing choice is a reward-bearing choice, regardless of type).
- No ship-specific columns or filtering on the Dilemmas page — a ship reward renders in the same Reward column, same layout rules, as a crew reward.
- No change to the Ships pages (`ShipsPage.tsx`, `ShipsTable.tsx`, `ships/getters.ts`) — those continue to use the player's owned ships, unrelated to this new catalog.

## Verification plan

- `tsc -b client` and `tsc --noEmit -p server` clean (note: **not** `tsc --noEmit -p client` — see `docs/PROJECT_STATE.md`'s "How this project is worked on").
- Live `GET /api/ship-catalog` returns Borg Cube among its entries.
- Real-browser check against `/dilemmas`: "Blow by Blow" and "Friends in Need" render correctly (icons, `(part 1/2)`/`(part 2/2)` subtitles), "Friends in Need"'s B choice shows the Borg Cube ship icon + name at 100%.
- Real-browser check against the topbar: "Refresh catalogs" option refreshes both crew and ship catalogs; "Refresh all" includes both.
- Confirm all 52 pre-existing crew `Reward` objects still render correctly after the `type: 'crew'` field is added (no regression from the schema change).
