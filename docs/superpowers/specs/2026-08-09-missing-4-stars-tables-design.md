# Missing 4★ Crew Tables — Design

## What this is

Two new tables on the Overview page, below the existing identity table,
showing 4★ crew archetypes the player does **not** own (neither
active-roster nor frozen) — split into "Missing 4 Stars (In Portal)" and
"Missing 4 Stars (Not in Portal)", each sorted by DataScore descending.
Their combined row count is guaranteed, by construction, to equal
`total - owned` from the existing "4 Stars unique crew" row (e.g. a
`683/703` row implies exactly 20 missing crew split across the two new
tables).

## The blocking question, resolved: what is "DataScore"?

The user named a specific column, "DataScore," visible on datacore.app,
giving one concrete data point: crew "V'Shal T'Pring" shows `57.47`
there. This is **not** `cab_ov` (that crew's CAB Overall Rating is
`10.3` — a different, smaller-scale metric). Searching the raw
`crew.json` payload for a value close to `57.47` on that exact crew
found `ranks.scores.overall = 57.47` — an exact match. Independently
confirmed via a dedicated public repository, `stt-datacore/datascore`,
whose README states plainly: *"these scripts are used to generate
scoring for the DataScore ranking system"* — i.e. `datascore` is the
actual name of this scoring system in the datacore project, and its
output is what populates `crew.json`'s `ranks.scores.overall` field.

**`ranks.scores.overall` is populated for all 1961 catalog entries, 0-100
scale, zero nulls** — strictly better-behaved than `cab_ov` (which has
real nulls, e.g. 2 of the current 20 missing 4★ crew have no CAB
rating) or `bigbook_tier` (which is `-1`, i.e. ungraded, for **all 20**
of the current real missing 4★ crew — unusable as a sort key today).
No null-handling fallback is needed for DataScore.

## The arithmetic, verified against real data

Using the real `example-data.json` roster and a live catalog pull:

```
total 4★ in catalog:        703
owned 4★ (active ∪ frozen): 683   (getOwnedArchetypeIds(..., 4).size — existing, unmodified)
missing 4★:                  20   (703 - 683)
  in portal:                  6
  not in portal:              14
  6 + 14 == 20 ✓, 683 + 20 == 703 ✓
```

The "missing" set is defined as the exact complement of the existing
`getOwnedArchetypeIds` result — reusing that function unmodified, not
recomputing ownership a second way — so this arithmetic invariant holds
by construction, not by coincidence: any future change to what counts as
"owned" automatically keeps both features consistent, since they share
the one function.

## Widening `CatalogEntry`

Both the server (`server/src/catalogClient.ts`) and client
(`client/src/types/catalogEntry.ts`) `CatalogEntry` interfaces grow from
3 fields to 8, adding exactly what these two tables need and nothing
more (this project's "type only what's used" discipline):

```ts
export interface CatalogEntry {
  archetype_id: number;
  max_rarity: number;
  in_portal: boolean;
  name: string;
  imageUrlPortrait: string;   // raw upstream field is already the exact
                              // flat "<prefix>_<name>.png" filename shape
                              // getAssetUrl() normally produces from a
                              // nested DatacoreAsset.file — see below
  data_score: number;         // from ranks.scores.overall
  traits: string[];
  traits_hidden: string[];
}
```

`traits`/`traits_hidden` are included specifically so `CatalogEntry`
satisfies `crewBelongsToCollection`'s existing signature
(`crew.traits`, `crew.traits_hidden`, `crew.archetype_id` — nothing
else) unmodified — see "Collections column" below.

Server-side reduction (`server/src/catalogClient.ts`'s existing
`raw.map(...)` step) extracts these directly from each raw upstream
entry:

```ts
{
  archetype_id: e.archetype_id,
  max_rarity: e.max_rarity,
  in_portal: e.in_portal,
  name: e.name,
  imageUrlPortrait: e.imageUrlPortrait,
  data_score: e.ranks?.scores?.overall ?? 0,
  traits: e.traits ?? [],
  traits_hidden: e.traits_hidden ?? [],
}
```

The `?? 0`/`?? []` fallbacks are defensive only — real data shows these
fields are always present — matching this project's established
"defensive but not distrustful" getter style.

## Deriving the missing-crew lists

**New, `client/src/catalog/getters.ts`:**

```ts
export function getMissingCrew(
  catalog: CatalogEntry[],
  ownedArchetypeIds: Set<number>,
  maxRarity: number,
  inPortal: boolean
): CatalogEntry[] {
  return catalog.filter(
    (c) => c.max_rarity === maxRarity && c.in_portal === inPortal && !ownedArchetypeIds.has(c.archetype_id)
  );
}
```

Called with the existing `getOwnedArchetypeIds(crewList,
frozenArchetypeIds, catalogMaxRarityById, 4)` (unmodified) as the owned
set.

**New, `client/src/catalog/sorters.ts`** (new file — first sorter this
domain has needed):

```ts
import type { CatalogEntry } from '../types/catalogEntry';

export function byDataScoreDesc(a: CatalogEntry, b: CatalogEntry): number {
  return b.data_score - a.data_score;
}
```

## Collections column

Reuses `crewBelongsToCollection`/`getCrewCollections`
(`collections/getters.ts`, unmodified) against `getCollectionsList(data)`
(the player's real collection definitions, already fetched by every
page that needs collections) — the exact same logic and exact same data
source every other page already uses to define "which collections is
this crew in," now simply invoked with a `CatalogEntry` instead of a
`CrewMember` (both satisfy the function's actual requirements:
`traits`, `traits_hidden`, `archetype_id`). No second, independent
notion of collection membership is introduced.

## Image handling

`imageUrlPortrait` (e.g. `"crew_portraits_cm_x_sm.png"`) is already in
the exact flat-filename form `getAssetUrl()` normally derives from a
nested `DatacoreAsset.file` (e.g. `"/crew_portraits/cm_x_sm"` →
strip leading `/`, replace remaining `/` with `_`, append `.png`) — so
no new URL-construction logic is needed, just a second, more direct way
to hand `Thumbnail` a URL. `Thumbnail`'s props widen, backward-compatibly:

```ts
export interface ThumbnailProps {
  asset?: DatacoreAsset;
  url?: string;
}

function Thumbnail({ asset, url }: ThumbnailProps) {
  const resolvedUrl = url ?? getAssetUrl(asset);
  // ...unchanged from here...
}
```

Every existing call site (`CrewTable`, `ShipsTable`, `QPsTable`) keeps
passing `asset` unchanged; the new table passes
`url={`${ASSET_BASE_URL}/${entry.imageUrlPortrait}`}` directly (a
one-line inline construction — not worth a new named helper for a
single call site).

## New table component

**`client/src/catalog/MissingCrewTable.tsx`** — its own dedicated table
(this project's established convention: one table component per
distinct column set), reused for both the in-portal and not-in-portal
tables via a `crew` prop (already filtered + sorted by the caller):

```tsx
export interface MissingCrewTableProps {
  crew: CatalogEntry[];
  collections: Collection[];
}

function MissingCrewTable({ crew, collections }: MissingCrewTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">DataScore</TableCell>
            <TableCell>Collections</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.archetype_id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Thumbnail url={`${ASSET_BASE_URL}/${c.imageUrlPortrait}`} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.data_score.toFixed(2)}</TableCell>
              <TableCell>
                {getCrewCollections(c, collections)
                  .map((col) => col.name)
                  .join(', ')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

Column order, per explicit request: `#`, `Image`, `Name`, `DataScore`,
`Collections` — no Stars/Level/Items-to-equip (not applicable to unowned
crew, explicitly excluded). DataScore right-aligned and formatted to 2
decimal places (`57.47`), matching this app's just-established
2-decimal convention from the Overview percentage feature.

## Overview page layout

`OverviewPage.tsx`, after the existing identity table: a `Divider` for
visual separation (per the request for "empty space or padding" between
the tables), then two headed sections, each a `Typography variant="h5"`
followed by its `MissingCrewTable`:

```tsx
<Divider sx={{ my: 2 }} />
<Typography variant="h5">Missing 4 Stars (In Portal)</Typography>
<MissingCrewTable crew={missingInPortal} collections={collectionsList} />
<Typography variant="h5">Missing 4 Stars (Not in Portal)</Typography>
<MissingCrewTable crew={missingNotInPortal} collections={collectionsList} />
```

Both sections are computed and rendered inside the same
`catalogLoading`/`catalogError` gate the existing "4 Stars unique crew"
row already uses — if the catalog fails to load, these two sections
simply don't render (consistent with the rest of the page degrading
gracefully rather than erroring), same as today's behavior for the
existing row's "Unavailable" state, just applied to whole sections
instead of one cell.

## Scope

New: `client/src/catalog/MissingCrewTable.tsx`,
`client/src/catalog/sorters.ts`.
Modified: `server/src/catalogClient.ts` (widen `CatalogEntry` +
reduction), `client/src/types/catalogEntry.ts` (widen `CatalogEntry`),
`client/src/catalog/getters.ts` (new `getMissingCrew` function),
`client/src/assets/Thumbnail.tsx` (backward-compatible `url` prop),
`client/src/pages/OverviewPage.tsx` (two new sections). No changes to
`crew/getters.ts`, `collections/getters.ts`, or any existing table
component — `getOwnedArchetypeIds`, `crewBelongsToCollection`, and
`Thumbnail`'s existing `asset` path are all reused unmodified.

**Note on the existing catalog cache:** widening `CatalogEntry` changes
the shape of `server/data/crew-catalog-cache.json`. The existing cache
file (written under the old 3-field shape) will be missing the five new
fields until the next refresh. Since `GET /api/crew-catalog` already has
a 24h TTL (from the previous feature) it will self-heal within a day
without intervention — but the implementation plan should explicitly
delete the stale cache file (or trigger `POST
/api/crew-catalog/refresh`) as part of its own verification, so this
isn't accidentally left half-migrated during development/testing.

## Verification

No automated test framework (deliberate, project-wide choice).

- A throwaway verify script confirming, against real
  `example-data.json` + a fresh catalog pull: the 703/683/20/6/14
  arithmetic above; that `getMissingCrew`'s two calls (inPortal
  true/false) partition with no overlap and no gaps against the full
  missing set; that `byDataScoreDesc` actually sorts descending (not
  ascending) on a hand-picked pair; and that `getCrewCollections`
  applied to a few real missing crew (e.g. V'Shal T'Pring) returns a
  plausible, non-empty collection name list.
- Interactive `playwright` MCP browser check: navigate to `/`, confirm
  both new headings and tables render below a visible gap after the
  identity table, confirm row counts sum to the "4 Stars unique crew"
  row's missing count (`total - owned`), confirm the first row in each
  table has the highest DataScore in that table, confirm thumbnails
  render (proving the `url` prop path works), confirm the Collections
  column shows real collection names.
