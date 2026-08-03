# Immortalization concept + two 4/4 Stars pages — Design

Date: 2026-08-03

## Purpose

Introduce the "Immortalized" crew concept (max_rarity reached, level 100,
all 4 equipment slots filled) and, on top of it, an ownership-aware
"ready to immortalize" concept: a crew is one equipment item away from
Immortalized, and that missing item is already owned (crafted, sitting in
inventory) even though it isn't equipped yet.

Two new pages split the "4/4 Stars crew" (crew that reached `max_rarity=4`
but isn't yet Immortalized) into:

- **"4/4 Stars crew (ready)"** — level 100, exactly one slot missing, and
  that item is already owned. Just needs to be equipped.
- **"4/4 Stars crew"** — everything else at 4/4: lower level, more than
  one slot missing, or missing exactly one slot but the item isn't owned
  yet (needs crafting first).

## Grounding in real data

Verified against the real 597-crew / 897-item sample (`example-data.json`,
gitignored):

- Owned items live at `player.character.items`, an array of 897 entries,
  each with a unique `archetype_id`. Sample shape:
  ```json
  { "id": 7666238969, "archetype_id": 159, "quantity": 6, "name": "Casing", ... }
  ```
- Each crew member has `equipment_slots`: always exactly 4 entries,
  `{ level: number, archetype: number }[]` — the archetype required for
  each of the 4 slot positions. `equipment` lists only the *filled*
  slots as `[slotIndex, itemId]` pairs; a slot index absent from
  `equipment` is missing, and its required archetype is
  `equipment_slots[thatIndex].archetype`.
- Confirmed against the user's own example: **Verad Dax** —
  `rarity: 4, max_rarity: 4, level: 100`, `equipment: [[1,1756],[2,664],[3,21712]]`
  (slot 0 missing), `equipment_slots[0].archetype === 21706`. The player's
  `items` array contains an entry with `archetype_id: 21706` ("Verad Dax's
  Outfit") — confirming Verad Dax is a genuine "ready" case.
- Of the 52 crew at `rarity=4, max_rarity=4`: 11 are level 100 with
  exactly 1 slot missing. Of those 11, 10 own the missing item; 1
  ("Tribble Spock") does not. Zero are already fully Immortalized within
  this specific 4/4 bucket (131 crew are Immortalized across all
  max_rarity values, just none currently at 4/4 for this player).
- This means, with the design below: **"4/4 Stars crew (ready)"** → 10
  crew, **"4/4 Stars crew"** → 42 crew (52 − 10).

## Non-goals

- No new table column for ownership status (confirmed with the user —
  the page split itself encodes the distinction; a visual indicator can
  be a future request).
- No changes to `CrewTable`, `StarRating`, `getCrewList`, `filterByRarity`,
  or the sorters — both new pages reuse them exactly as-is.
- No UI for browsing the full items inventory — `getOwnedItems` is
  introduced only to support the ownership check, not as the basis of a
  new "Items" page (that would be a separate future request).

## Design

### Types

`client/src/types/item.ts` (new file):

```ts
export interface OwnedItem {
  archetype_id: number;
}
```

Narrow by design — only the field actually used (matching the same
minimal-typing discipline as `CrewMember`).

`client/src/types/crew.ts` — add:

```ts
equipment_slots: { level: number; archetype: number }[];
```

### Getters (`client/src/crew/getters.ts`)

```ts
export function getOwnedItems(data: PlayerData): OwnedItem[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const items = character?.items;
  return Array.isArray(items) ? (items as OwnedItem[]) : [];
}

export function getMissingEquipmentArchetypeIds(crew: CrewMember): number[] {
  const filledSlots = new Set(crew.equipment.map(([slot]) => slot));
  const missingIndices = [0, 1, 2, 3].filter((i) => !filledSlots.has(i));
  return missingIndices.map((i) => crew.equipment_slots[i].archetype);
}

export function areAllMissingItemsOwned(crew: CrewMember, items: OwnedItem[]): boolean {
  const missingArchetypeIds = getMissingEquipmentArchetypeIds(crew);
  return missingArchetypeIds.every((archetypeId) => items.some((item) => item.archetype_id === archetypeId));
}

export function isImmortalized(crew: CrewMember): boolean {
  return crew.rarity === crew.max_rarity && crew.level === 100 && crew.equipment.length === 4;
}

export function isReadyToImmortalize(crew: CrewMember, items: OwnedItem[]): boolean {
  return (
    crew.rarity === crew.max_rarity &&
    crew.level === 100 &&
    getEquipmentSlotsRemaining(crew) === -1 &&
    areAllMissingItemsOwned(crew, items)
  );
}
```

Both `isImmortalized` and `isReadyToImmortalize` are self-contained (they
check `rarity === max_rarity` themselves) so they give correct answers on
any crew array, not just one already narrowed by `filterByRarity` — this
keeps them independently reusable for a future max_rarity value, exactly
like `StarRating` isn't hardcoded to 4/5 stars.

### Filters (`client/src/crew/filters.ts`)

```ts
export function filterReadyToImmortalize(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => isReadyToImmortalize(c, items));
}

export function filterNeedsWork(crew: CrewMember[], items: OwnedItem[]): CrewMember[] {
  return crew.filter((c) => !isImmortalized(c) && !isReadyToImmortalize(c, items));
}
```

`filterNeedsWork` is the resolved edge case: a level-100 crew missing
exactly one item it doesn't own fails `isReadyToImmortalize` (item not
owned) and isn't `isImmortalized` (still missing gear), so it correctly
falls into `filterNeedsWork` — matching the user's explicit decision on
the Tribble Spock-style edge case.

### Pages

Both pages follow the exact structure of `FourFiveStarsCrewPage.tsx`:
own `usePlayerData()` call, own filter composition, same sort
(`combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byNameAsc)`),
same loading/error/empty-state handling, `<CrewTable crew={crew} />` for
the table.

- `client/src/pages/FourFourStarsCrewReadyPage.tsx` — title/nav label
  "4/4 Stars crew (ready)", route `/4-4-stars-crew-ready`. Pipeline:
  `filterReadyToImmortalize(filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }), getOwnedItems(data))`.
- `client/src/pages/FourFourStarsCrewPage.tsx` — title/nav label
  "4/4 Stars crew", route `/4-4-stars-crew`. Pipeline:
  `filterNeedsWork(filterByRarity(getCrewList(data), { rarity: 4, maxRarity: 4 }), getOwnedItems(data))`.

Both added to `AppLayout`'s `NAV_ITEMS` and `App.tsx`'s routes, alongside
the three existing entries.

## Open questions

None — fully scoped and confirmed with the user, including the edge-case
resolution.
