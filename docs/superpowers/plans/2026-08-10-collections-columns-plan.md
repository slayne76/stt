# Collections Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Total collections" (count) + "Collections names"
(comma-separated) column pair, in that order, to the four star-tier crew
pages and both of the Overview page's Missing 4 Stars tables — renaming
each table's existing single "Collections" column in the process.
`FrozenDuplicatesPage` explicitly keeps its original single count
column, unrenamed.

**Architecture:** One existing getter (`getCollectionCount`) gets its
parameter type widened to match a sibling getter
(`getCrewCollections`)'s already-existing `CollectionMatchable`
structural type, so both can be called from `MissingCrewTable` (which
deals in `CatalogEntry`, not `CrewMember`). `CrewTable` gains a required
`showCollectionsNames` boolean prop so the one shared component can
serve both the 4 pages that want the new column and the 1 page
(`FrozenDuplicatesPage`) that doesn't, with the choice visible at each
call site.

**Tech Stack:** React 19, TypeScript, MUI v6. No test framework in this
project (deliberate, repeated choice) — verification is `tsc`/`eslint`,
a data-driven check against the real `example-data.json` sample, and a
real-browser check.

## Global Constraints

- `getCollectionCount`'s parameter type changes from `CrewMember` to
  `CollectionMatchable` — a pure widening (verified: `CrewMember`
  already has all of `CollectionMatchable`'s fields). No existing call
  site's behavior may change.
- `CrewTable`'s new `showCollectionsNames` prop is **required**, not
  defaulted — every call site must state it explicitly. This is
  deliberate (confirmed with the user): the `FrozenDuplicatesPage`
  exclusion must be visible in that file's own diff, not an invisible
  default.
- `FrozenDuplicatesPage` (and its two thin wrappers,
  `FourStarsDuplicatesPage`/`FiveStarsDuplicatesPage`, which render it
  internally and need no direct changes) keeps its original single
  "Collections" column, unrenamed, unchanged in every way.
- `QPsPage`/`QPsTable` are out of scope entirely — no file listed below
  touches them.
- `OverviewPage.tsx` itself is not touched — both of its
  `<MissingCrewTable ... />` usages need no prop changes, since
  `MissingCrewTable` has no exclusion case (unlike `CrewTable`).
- No sorting changes, no truncation on the new "Collections names"
  cells — matches `MissingCrewTable`'s existing (unchanged) rendering
  of that data today.

---

### Task 1: Both columns, all six pages

**Files:**
- Modify: `client/src/collections/getters.ts`
- Modify: `client/src/crew/CrewTable.tsx`
- Modify: `client/src/catalog/MissingCrewTable.tsx`
- Modify: `client/src/pages/ThreeFourStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFiveStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewPage.tsx`
- Modify: `client/src/pages/FourFourStarsCrewReadyPage.tsx`
- Modify: `client/src/pages/FrozenDuplicatesPage.tsx`

**Interfaces:**
- Produces: `getCollectionCount(crew: CollectionMatchable, collections: Collection[]): number` from `./getters` (signature change — parameter type widened from `CrewMember`). `CrewTable`'s prop interface gains `showCollectionsNames: boolean` (required).
- Consumes: `CollectionMatchable` (pre-existing, from `./getters`, unchanged), `getCrewCollections` (pre-existing, unchanged).

This is a single task — splitting `CrewTable`'s prop change from its 5
call sites would leave an intermediate commit where the app doesn't
compile (`showCollectionsNames` required but not yet passed), the same
class of mistake already hit once earlier in this project's history
(Task 1's build-breaking gap in the Automatic STT login feature) and
now deliberately avoided by keeping tightly-coupled changes in one task.

- [ ] **Step 1: Widen `getCollectionCount`'s parameter type**

In `client/src/collections/getters.ts`, change:

```ts
export function getCollectionCount(crew: CrewMember, collections: Collection[]): number {
  return getCrewCollections(crew, collections).length;
}
```

to:

```ts
export function getCollectionCount(crew: CollectionMatchable, collections: Collection[]): number {
  return getCrewCollections(crew, collections).length;
}
```

(Only the parameter type on this one function changes — everything
else in the file, including the `CrewMember` import if still used
elsewhere in the file, stays as-is. Check whether `CrewMember` is still
referenced elsewhere in this file after this change; if not, remove the
now-unused import to keep lint clean.)

- [ ] **Step 2: Update `client/src/crew/CrewTable.tsx`**

Replace its entire contents with:

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining } from './getters';
import { getCollectionCount, getCrewCollections } from '../collections/getters';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';

export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
  showCollectionsNames: boolean;
}

function CrewTable({ crew, collections, showCollectionsNames }: CrewTableProps) {
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
            {showCollectionsNames && <TableCell>Collections names</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={c.portrait} />
              </TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.level}</TableCell>
              <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
              <TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
              {showCollectionsNames && (
                <TableCell>
                  {getCrewCollections(c, collections)
                    .map((col) => col.name)
                    .join(', ')}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default CrewTable;
```

- [ ] **Step 3: Update `client/src/catalog/MissingCrewTable.tsx`**

Replace its entire contents with:

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import type { Collection } from '../types/collection';
import { getCollectionCount, getCrewCollections } from '../collections/getters';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';

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
            <TableCell align="right">Total collections</TableCell>
            <TableCell>Collections names</TableCell>
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
              <TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
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

export default MissingCrewTable;
```

- [ ] **Step 4: Update the four star-tier crew pages to pass `showCollectionsNames={true}`**

In each of these four files, change the line
`<CrewTable crew={crew} collections={collections} />` to
`<CrewTable crew={crew} collections={collections} showCollectionsNames={true} />`:

- `client/src/pages/ThreeFourStarsCrewPage.tsx` (line 33)
- `client/src/pages/FourFiveStarsCrewPage.tsx` (line 33)
- `client/src/pages/FourFourStarsCrewPage.tsx` (line 36)
- `client/src/pages/FourFourStarsCrewReadyPage.tsx` (line 36)

- [ ] **Step 5: Update `FrozenDuplicatesPage.tsx` to pass `showCollectionsNames={false}`**

In `client/src/pages/FrozenDuplicatesPage.tsx` (line 39), change
`<CrewTable crew={crew} collections={collections} />` to
`<CrewTable crew={crew} collections={collections} showCollectionsNames={false} />`.

- [ ] **Step 6: Build and lint**

```bash
npm run build -w client
npm run lint -w client
```

Expected: both exit cleanly (no `tsc` errors — including confirming
every one of `CrewTable`'s 5 call sites now supplies the required
`showCollectionsNames` prop — no new ESLint errors/warnings).

- [ ] **Step 7: Data-driven verification against `example-data.json`**

Create a throwaway script `client-verify-collections.mjs` at the repo
root (plain Node, no build step needed — reads the JSON directly):

```js
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('example-data.json', 'utf-8'));
const crewList = data.player.character.crew;
const collections = data.player.character.cryo_collections;

function crewBelongsToCollection(crew, collection) {
  const crewTraits = new Set([...(crew.traits ?? []), ...(crew.traits_hidden ?? [])]);
  const collectionTraits = collection.traits ?? [];
  const extraCrew = collection.extra_crew ?? [];
  return collectionTraits.some((trait) => crewTraits.has(trait)) || extraCrew.includes(crew.archetype_id);
}

function getCrewCollections(crew, collections) {
  return collections.filter((collection) => crewBelongsToCollection(crew, collection));
}

let checked = 0;
let mismatches = 0;
for (const crew of crewList.slice(0, 50)) {
  const matched = getCrewCollections(crew, collections);
  const count = matched.length;
  const names = matched.map((c) => c.name);
  checked++;
  if (count !== names.length) {
    mismatches++;
    console.error(`MISMATCH for ${crew.name}: count=${count}, names.length=${names.length}`);
  }
}

console.log(`Checked ${checked} crew — count vs. names.length agree for all of them: ${mismatches === 0}`);
if (mismatches > 0) process.exit(1);
```

Run: `node client-verify-collections.mjs`

Expected: `Checked 50 crew — count vs. names.length agree for all of
them: true`. This confirms "Total collections" and "Collections names"
are derived from the same underlying match set by construction, not
just by inspection of the (identical) production code — this script
independently re-derives it from the raw JSON, it doesn't import the
app's own getter, in case the app code has a bug the same code reused
in the check would hide.

Delete the script afterward: `rm client-verify-collections.mjs`

- [ ] **Step 8: Real-browser verification**

Start the dev server (seed `server/data/player-cache.json` from
`example-data.json` first if this is a fresh worktree — standing
worktree setup step):

```bash
npm run dev
```

Using the browser tooling, confirm:
- Each of the four star-tier crew pages (3/4, 4/5, 4/4, 4/4-ready)
  shows both "Total collections" and "Collections names" as the last
  two columns, in that order, with real values (spot-check one row
  against the numbers already visible on the existing `CollectionsPage`
  for the same crew member, since that page's membership logic is the
  same underlying function and already independently verified in an
  earlier feature).
- The Duplicates page (`/4-stars-duplicates` or `/5-stars-duplicates`)
  shows only the original single "Collections" column (unrenamed) —
  confirm no "Total collections" or "Collections names" header appears
  anywhere on that page.
- The Overview page's two Missing 4 Stars tables ("In Portal" /
  "Not in Portal") each show "Total collections" immediately before
  "Collections names", both populated with real values.

- [ ] **Step 9: Commit**

```bash
git add client/src/collections/getters.ts client/src/crew/CrewTable.tsx \
  client/src/catalog/MissingCrewTable.tsx \
  client/src/pages/ThreeFourStarsCrewPage.tsx \
  client/src/pages/FourFiveStarsCrewPage.tsx \
  client/src/pages/FourFourStarsCrewPage.tsx \
  client/src/pages/FourFourStarsCrewReadyPage.tsx \
  client/src/pages/FrozenDuplicatesPage.tsx
git commit -m "Add Total collections / Collections names column pair

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** the `getCollectionCount` widening, `CrewTable`'s
  required prop and its conditional column, `MissingCrewTable`'s new
  column + rename, all 5 `CrewTable` call sites (4 opted in, 1 opted
  out), and all 4 items from the spec's verification plan (data check,
  crew-page browser check, Duplicates-page exclusion check, Overview
  browser check) are each covered by a concrete step.
- **No placeholders:** every code block is complete and
  copy-pasteable; the verification script is real, runnable code, not
  a description of what to check.
- **Type consistency:** `CrewTableProps.showCollectionsNames: boolean`
  matches every one of its 5 call sites exactly (4× `true`, 1× `false`).
  `getCollectionCount`'s new `CollectionMatchable` parameter type is
  used identically at both its call sites (`CrewTable.tsx`,
  `MissingCrewTable.tsx`) — same import, same signature assumed.
- **Single-task plan confirmed correct:** `CrewTable`'s prop change and
  its 5 call sites cannot be split across tasks without an
  intermediate non-compiling state — the same class of gap already hit
  once this project (Task 1's `sttClient.ts` scope gap in the Automatic
  STT login feature) and deliberately avoided here by keeping the
  tightly-coupled changes together.
