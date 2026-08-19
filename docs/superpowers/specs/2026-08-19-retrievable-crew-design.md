# Retrievable Crew — Design

**Date:** 2026-08-19
**Status:** Approved

## Problem

There's no page tracking which crew are eligible for retrieval via Polestars (the "spend keystones to guarantee-pull a specific crew" mechanic), or which specific Polestars the player has chosen for each tracked crew. This needs a new top-level page + table with a curated (small, hand-picked) list of crew, showing the usual crew-table columns plus 4 chosen-Polestar columns. A future phase will make the table editable from the UI; this phase builds the static read path plus the backend storage it will write to later.

Two data-source gaps exist before any of this can render: no Polestar catalog anywhere in the app, and no per-crew "which Polestars can retrieve this crew" data. Both are resolved below by an existing, previously-unused datacore.app field.

## Investigation

### The Polestar catalog

`https://datacore.app/structured/keystones.json` (same host as crew/ship catalogs) is a genuine, ownership-independent catalog of 1913 entries. Only entries with `type: "keystone"` (278 of them) are actual individual Polestars — the rest (`crew_keystone_crate`, `keystone_crate`) are multi-Polestar "constellation crate" bundles, not needed here. A `keystone` entry:

```json
{
  "id": 14157,
  "symbol": "aenar_keystone",
  "type": "keystone",
  "name": "Aenar Polestar",
  "short_name": "Aenar",
  "icon": { "file": "/items/keystones/aenar.png" },
  "rarity": 4,
  "filter": { "type": "trait", "trait": "aenar" }
}
```

`filter.type` is one of three kinds, confirmed by counting all 278: `rarity` (5 entries, one per crew rarity 1-5, e.g. `{ "type": "rarity", "rarity": 5 }`), `skill` (6 entries, one per the game's 6 skills, e.g. `{ "type": "skill", "skill": "command_skill" }`), `trait` (267 entries, e.g. `{ "type": "trait", "trait": "aenar" }`).

**Icon path quirk:** unlike ship catalog `icon.file` values (extension-less, e.g. `/ship_previews/borg_cube`), Polestar `icon.file` values already end in `.png`. The shared `getAssetUrl()` helper always appends `.png` itself, so building a `PolestarCatalogEntry.icon.file` requires stripping any existing `.png` suffix first, to avoid a double extension.

### Per-crew Polestar eligibility — already in the crew catalog's upstream source

`https://datacore.app/structured/crew.json` (the existing crew catalog's upstream) carries two fields per crew that `fetchCrewCatalog()` currently discards entirely: `unique_polestar_combos` and `unique_polestar_combos_later`, each an array of Polestar-filter-key combinations sufficient to uniquely retrieve that crew. Flattening and unioning both fields, for real data, gives exactly the eligible-Polestar pool for that crew. Confirmed against the example given for this feature — Minooki Freeman's union is:

```
command_skill, communicator, compromised, crew_max_rarity_5, desperate,
diplomacy_skill, explorer, federation, human, science_skill, spiritual, starfleet
```

— a **12/12 exact match** against the hand-provided pool (Legendary→`crew_max_rarity_5`, Communicator, Compromised, Desperate, Explorer, Federation, Human, Spiritual, Starfleet, Command→`command_skill`, Diplomacy→`diplomacy_skill`, Science→`science_skill`). Note neither field alone is sufficient — `unique_polestar_combos` alone is missing `human`, `unique_polestar_combos_later` alone is missing `science_skill` — both must be unioned.

This means the eligible pool never needs manual entry or separate storage: it's derived from data the crew catalog already fetches, stays correct automatically as datacore updates it, and satisfies "should always keep this dynamic" for free.

## Design

### Server: Polestar catalog (mirrors the ship catalog exactly)

- `server/src/polestarCatalogClient.ts` — `fetchPolestarCatalog(): Promise<PolestarCatalogEntry[]>`, fetches `keystones.json`, filters to `type === 'keystone'`, maps to:
  ```ts
  export interface PolestarCatalogEntry {
    id: number;
    name: string;
    short_name: string;
    icon: { file: string }; // .png suffix stripped, see Investigation
    rarity: number;
    filter:
      | { type: 'rarity'; rarity: number }
      | { type: 'trait'; trait: string }
      | { type: 'skill'; skill: string };
  }
  ```
- `server/src/polestarCatalogCache.ts` — same 24h-TTL file-cache pattern as `shipCatalogCache.ts` (`readPolestarCatalogCache`/`writePolestarCatalogCache`/`isPolestarCatalogCacheFresh`), cache file at `server/data/polestar-catalog-cache.json` (existing gitignored `server/data/` pattern, no new `.gitignore` entry needed).
- `server/src/routes/polestarCatalog.ts` — `GET /api/polestar-catalog` (serve fresh cache, else fetch live and cache, stale-cache fallback on a live-fetch failure) + `POST /api/polestar-catalog/refresh` (always fetch live, no fallback) — identical shape to `routes/shipCatalog.ts`. Registered in `index.ts` alongside the other routers.

### Client: Polestar catalog (mirrors the ship catalog exactly)

- `client/src/types/polestarCatalogEntry.ts` — the `PolestarCatalogEntry` interface (client-side mirror).
- `client/src/api/polestarCatalogApi.ts` — `fetchPolestarCatalog()` / `refreshPolestarCatalog()`.
- `client/src/context/PolestarCatalogContext.tsx` + `client/src/hooks/usePolestarCatalog.ts` — same `{ data, loading, error, refresh }` shape as `ShipCatalogContext`/`useShipCatalog`.
- Mounted in `App.tsx` innermost, alongside `CrewCatalogProvider`/`DilemmasProvider`/`ShipCatalogProvider` (same rationale as those three: cheap fetch, nesting position doesn't matter).

### Refresh wiring

- `RefreshControl.tsx`: the `'catalog'` option's handler now fires crew, ship, **and Polestar** catalog refresh together via `Promise.allSettled([...])`. New prop `polestarCatalogRefreshing: boolean` + `onRefreshPolestarCatalog: () => Promise<void>`, folded into the existing `isRefreshing` computation for both `'catalog'` and `'all'`.
- `AppLayout.tsx`: wires `usePolestarCatalog()`'s `refresh`/`loading`/`error` into the new props, gets a Polestar-catalog-error `Snackbar`, same pattern as the crew/ship-catalog-error ones.

### Crew catalog extension — flattened eligibility keys

`CatalogEntry` (both `server/src/catalogClient.ts` and `client/src/types/catalogEntry.ts`) gains one field:

```ts
polestarFilterKeys: string[]; // deduplicated, sorted union of unique_polestar_combos + unique_polestar_combos_later, flattened
```

Computed once in `fetchCrewCatalog()`'s existing per-entry mapping, from `RawCatalogEntry`'s (currently untyped, via its `[key: string]: unknown` index signature) `unique_polestar_combos` and `unique_polestar_combos_later` arrays — both typed as `string[][] | undefined`, defaulting to `[]`.

This field is plumbing for the next (editable) phase's "choose up to 4 from the eligible pool" picker — **not rendered anywhere in this phase**. A resolver, `resolveEligiblePolestars(filterKeys: string[], polestarCatalog: PolestarCatalogEntry[]): PolestarCatalogEntry[]` in `client/src/polestars/getters.ts`, maps each raw key to its catalog entry: a `crew_max_rarity_N` prefix → the `rarity`-filter Polestar with that `rarity`; one of the 6 known `*_skill` keys (`command_skill`, `diplomacy_skill`, `security_skill`, `engineering_skill`, `science_skill`, `medicine_skill`, matching `SKILL_ABBREVIATIONS`' keys) → the matching `skill`-filter Polestar; anything else → the `trait`-filter Polestar with that `trait`. Built now (and unit-testable via the Minooki Freeman cross-check above) so the next phase doesn't need to revisit this mapping.

### Server: Retrievable Crew storage

- `server/data/retrievable-crew.json` — gitignored runtime file (covered by the existing `server/data/` `.gitignore` entry), server-owned, shape:
  ```json
  [{ "archetypeId": 12345, "polestars": [14298, 14434, 14247, null] }]
  ```
  `polestars` is always a 4-element array (fixed slot positions, Polestar #1..#4 in order); `null` marks an unfilled slot. Not a remote-fetch cache — no TTL, no upstream refetch.
- `server/src/retrievableCrewStore.ts` — `readRetrievableCrew(): RetrievableCrewEntry[]` (returns `[]` if the file doesn't exist yet, matching the "gracefully absent" convention of the other cache readers) / `writeRetrievableCrew(entries: RetrievableCrewEntry[]): void`. `writeRetrievableCrew` is unused by any route in this phase — included now so the next (editable) phase only has to add a route, not storage logic.
- `server/src/routes/retrievableCrew.ts` — `GET /api/retrievable-crew` → `RetrievableCrewEntry[]` (bare array, matching crew/ship catalog response shape — not wrapped like `DilemmasResponse`). No write endpoint in this phase.
- I will seed this file with the Minooki Freeman row directly on the running server's checkout once the code is merged — it's gitignored, so this is not a git commit, mirroring how the other `server/data/*.json` files are populated (by the server itself, or here, by hand once).

### Client: Retrievable Crew

- `client/src/types/retrievableCrew.ts` — `RetrievableCrewEntry` (client mirror).
- `client/src/api/retrievableCrewApi.ts` — `fetchRetrievableCrew()`.
- `client/src/context/RetrievableCrewContext.tsx` + `client/src/hooks/useRetrievableCrew.ts` — same `{ data, loading, error, refresh }` shape as `DilemmasContext`/`useDilemmas` (GET-only, no upstream to refresh against — `refresh` just re-fetches our own `/api/retrievable-crew`, same as Dilemmas today).
- Mounted in `App.tsx` innermost, alongside the others.

### Frontend page

- New top-level nav item **"Retrievable Crew"**, positioned after "Dilemmas", route `/retrievable-crew` — added to `NAV_ITEMS` in `routes.tsx` (not nested in a group, matching Dilemmas/Collections/Overview).
- `client/src/pages/RetrievableCrewPage.tsx` — joins:
  - `useRetrievableCrew()` — which archetype IDs to show + their chosen Polestars
  - `useCrewCatalog()` — name, image, `max_rarity`, traits (for collections matching, works unowned per the existing `CollectionMatchable` pattern used by `MissingCrewTable`)
  - `usePlayerData()` — owned crew list (`getCrewList`), to find an owned instance (if any) per tracked archetype ID, and collections (`getCollectionsList`, existing) for Total collections
  - `usePolestarCatalog()` — icon + short name for each chosen Polestar ID
  - Ownership resolution: if the player owns 2+ copies of a tracked archetype, pick the most-invested copy — sort by `rarity` desc, then `level` desc, take the first. If unowned, Level/Items-to-equip/Stars render `—`; Image/Name/Total collections/Polestar columns still render off catalog data alone.
- `client/src/polestars/RetrievableCrewTable.tsx` — columns: `# · Image · Stars · Name · Level · Items to equip · Total collections · Polestar #1 · Polestar #2 · Polestar #3 · Polestar #4`. Reuses `Thumbnail`, `StarRating`, `getEquipmentSlotsRemaining`, `getCrewCollections` exactly as `CrewTable.tsx` does. Each Polestar cell: `Thumbnail asset={entry.icon}` + short name (mirrors `RewardIcon`'s ship branch in `DilemmasTable.tsx`), or `—` for a `null` slot or an unresolved ID.
- `client/src/polestars/getters.ts` — `resolveEligiblePolestars` (described above, unused by the page yet) and a small `resolvePolestarSlot(id: number | null, polestarCatalogMap): PolestarCatalogEntry | null` helper the table cell uses.

### Seed data (this phase's one row)

```json
{ "archetypeId": <Minooki Freeman's real archetype_id, looked up from the crew catalog>, "polestars": [<Desperate's id>, <Explorer's id>, <Spiritual's id>, null] }
```

Polestar IDs resolved by name against the live Polestar catalog at implementation time (not hardcoded here) — same "resolve against the live catalog, don't guess" convention already used for every dilemma crew/ship reward this session.

## Non-goals

- No add/edit/remove UI for rows or chosen Polestars — read-only this phase, per your explicit "later I will ask you to make this table editable."
- No "not in portal" filtering, warning, or validation UI — the page renders whatever's in `retrievable-crew.json` regardless of current portal status. (The underlying data — `in_portal` on `CatalogEntry` — already exists and already refreshes dynamically, so nothing blocks adding this later.)
- No write endpoint for `/api/retrievable-crew` — `writeRetrievableCrew()` exists in storage but is unused; the next phase adds the route.
- No change to any existing crew page, table, or getter beyond the additive `polestarFilterKeys` field on `CatalogEntry` (unused by existing pages).
- No change to how `DilemmasTable`/ship rewards render — unrelated to this feature.

## Verification plan

- `tsc -b client` and `tsc --noEmit -p server` clean.
- Live `GET /api/polestar-catalog` returns 278 entries including Legendary, Communicator, Compromised, Desperate, Explorer, Federation, Human, Spiritual, Starfleet, Command, Diplomacy, Science.
- Live `GET /api/retrievable-crew` returns the seeded Minooki Freeman row.
- Real-browser check against `/retrievable-crew`: nav item present after Dilemmas, row renders with correct Image/Stars/Name/Level/Items-to-equip/Total collections (matching the player's actual owned Minooki Freeman instance) and Polestar #1/#2/#3 = Desperate/Explorer/Spiritual icons+names, Polestar #4 = `—`.
- Real-browser check against the topbar: "Refresh catalogs" refreshes crew, ship, and Polestar catalogs together; "Refresh all" includes all three.
- Confirm the Minooki Freeman `polestarFilterKeys` cross-check (12/12 match against the hand-provided list) still holds once wired through the real `fetchCrewCatalog()` mapping, not just the raw JSON inspected during investigation.
