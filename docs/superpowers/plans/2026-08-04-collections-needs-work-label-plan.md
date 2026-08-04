# Collections "Needs Work" Tier Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Collections page's per-collection crew sub-list, give crew at the `needsWork` tier (`rarity === max_rarity`, but not level 100 and/or not all equipment slots filled) a visible label distinguishing them from `leveling`-tier crew, mirroring the existing "Ready" chip for the `ready` tier.

**Architecture:** Purely a rendering change in one existing file, `client/src/collections/CollectionCrewList.tsx`. No new getters, filters, types, or business logic — `getCrewTier` (`client/src/crew/getters.ts`) already distinguishes `ready` / `needsWork` / `leveling` / `null`; this task adds a second conditional chip keyed off the `needsWork` value, alongside the existing `ready` conditional. The two chips are mutually exclusive by construction, since `getCrewTier` returns a single tier value per crew.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI, no new dependencies.

## Global Constraints

- **Chip text:** `` `${crew.max_rarity} Stars` `` — e.g. "4 Stars", "5 Stars". No singular/plural special-casing (a hypothetical `max_rarity === 1` renders "1 Stars" — accepted, matches the literal spec, not a bug).
- **Chip color:** MUI `color="warning"` (amber/orange) — distinct from the existing green (`color="success"`) "Ready" chip.
- **No bold name for `needsWork`** — bold stays reserved for `ready` only, exactly as it is today. `needsWork` crew get normal-weight names plus the new chip.
- **Scoped to `CollectionCrewList.tsx` only** — no changes to the standalone "4/4 Stars crew" (needs work) page (`FourFourStarsCrewPage.tsx`) or any other page. Every row on that page is already `needsWork` by definition of its filter, so a per-row label there would be redundant; this label's value is specifically in distinguishing tiers where multiple appear side by side, which only happens in `CollectionCrewList`.
- **`getCrewTier` is untouched** — no changes to `client/src/crew/getters.ts`, `client/src/crew/sorters.ts`, or `client/src/collections/getters.ts`.
- **Verified against real data, must reproduce exactly:** across all 88 collections' qualifying crew (`getCollectionCrew` output) in `example-data.json`, exactly **137** crew entries are tier `needsWork` (vs. 16 `ready`, 190 `leveling`). Every one of those 137 has `max_rarity === 4` (no 3-star or 5-star `needsWork` crew exist in this sample — a data fact, not something to special-case). One concrete example to spot-check by name: in collection **"The Neutral Zone"**, crew **"Zhaban"** is `needsWork` tier with `max_rarity === 4`, so their row must show a "4 Stars" chip.
- No test framework — verification via type-check, lint, a throwaway data-driven verification script against real `example-data.json`, and manual dev-server checks.

---

### Task 1: Add the "needsWork" tier chip to `CollectionCrewList`

**Files:**
- Modify: `client/src/collections/CollectionCrewList.tsx`

**Interfaces:**
- Consumes: `getCrewTier(crew: CrewMember, items: OwnedItem[]): CrewTier | null` (`client/src/crew/getters.ts`, pre-existing, unchanged) — `CrewTier = 'ready' | 'needsWork' | 'leveling'`.
- Produces: no new exports — `CollectionCrewList`'s props (`CollectionCrewListProps { crew: CrewMember[]; items: OwnedItem[] }`) and default export are unchanged, only its internal rendering changes.

- [ ] **Step 1: Modify `client/src/collections/CollectionCrewList.tsx`**

Replace the full file contents with:

```tsx
import { Box, Chip, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import StarRating from '../crew/StarRating';

export interface CollectionCrewListProps {
  crew: CrewMember[];
  items: OwnedItem[];
}

function CollectionCrewList({ crew, items }: CollectionCrewListProps) {
  return (
    <Box sx={{ py: 1 }}>
      {crew.map((c) => {
        const tier = getCrewTier(c, items);
        const isReady = tier === 'ready';
        const isNeedsWork = tier === 'needsWork';
        return (
          <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
            <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
            <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal' }}>{c.name}</Typography>
            {isReady && <Chip label="Ready" size="small" color="success" />}
            {isNeedsWork && <Chip label={`${c.max_rarity} Stars`} size="small" color="warning" />}
            <Typography color="text.secondary" sx={{ ml: 'auto' }}>
              Lv {c.level}
            </Typography>
            <Typography color="text.secondary" sx={{ minWidth: 80, textAlign: 'right' }}>
              Items: {getEquipmentSlotsRemaining(c)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export default CollectionCrewList;
```

- [ ] **Step 2: Verify against real data**

`example-data.json` (gitignored, real personal game data) is at the repo root. Create a throwaway script at `client/src/collections/__verify.ts` (deleted in Step 3, never committed):

```ts
import { readFileSync } from 'node:fs';
import { getCrewList, getOwnedItems, getCrewTier } from '../crew/getters';
import { getCollectionsList, getFrozenCrewArchetypeIds, getCollectionCrew } from './getters';

const raw = JSON.parse(readFileSync('example-data.json', 'utf-8')) as Record<string, unknown>;
const crew = getCrewList(raw);
const items = getOwnedItems(raw);
const collections = getCollectionsList(raw);
const frozenArchetypeIds = getFrozenCrewArchetypeIds(raw);

let readyCount = 0;
let needsWorkCount = 0;
let levelingCount = 0;
const needsWorkMaxRarities = new Set<number>();
let zhabanFound = false;

for (const collection of collections) {
  const qualifyingCrew = getCollectionCrew(collection, crew, items, frozenArchetypeIds);
  for (const c of qualifyingCrew) {
    const tier = getCrewTier(c, items);
    if (tier === 'ready') readyCount++;
    else if (tier === 'needsWork') {
      needsWorkCount++;
      needsWorkMaxRarities.add(c.max_rarity);
      if (collection.name === 'The Neutral Zone' && c.name === 'Zhaban') zhabanFound = true;
    } else if (tier === 'leveling') levelingCount++;
  }
}

console.log('ready:', readyCount, 'needsWork:', needsWorkCount, 'leveling:', levelingCount);
console.log('needsWork max_rarity values:', [...needsWorkMaxRarities]);
console.log('Zhaban in The Neutral Zone is needsWork:', zhabanFound);
```

Run from the **repo root**: `npx tsx client/src/collections/__verify.ts`

Expected output:
- `ready: 16 needsWork: 137 leveling: 190`
- `needsWork max_rarity values: [ 4 ]`
- `Zhaban in The Neutral Zone is needsWork: true`

If any of these don't match, do not proceed — re-check the change against this plan's Global Constraints before moving on (this script only reads existing getters; it doesn't exercise the new chip rendering directly, but confirms the `needsWork` tier population the chip will be applied to hasn't shifted).

- [ ] **Step 3: Delete the throwaway verification script**

```bash
rm client/src/collections/__verify.ts
```

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no errors.

- [ ] **Step 5: Manual dev-server check**

With `server/.env` absent, start `npm run dev -w server` and `npm run dev -w client` in the background (use alternate ports if the defaults are occupied by an unrelated process, and fully revert any temporary port edits before committing).

Run: `curl -s http://localhost:5173/` (or your alternate port) — expect `id="root"` in the response, confirming the client still serves its shell with the modified component compiled in.

Stop both background processes afterward.

**Manual follow-up (requires your real credentials, not part of this task):** with a real `STT_SESSION_COOKIE` set, open `/collections`, expand a collection with `needsWork`-tier crew (e.g. one containing a 4/4-max-rarity crew that isn't level 100 or fully equipped), and confirm those rows show a "4 Stars" amber chip while `ready` rows still show the bold name + green "Ready" chip, and `leveling` rows show neither.

- [ ] **Step 6: Commit**

```bash
git add client/src/collections/CollectionCrewList.tsx
git commit -m "Add tier label for needsWork crew on Collections page"
```
