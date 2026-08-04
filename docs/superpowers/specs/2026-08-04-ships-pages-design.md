# Ships Pages — Design

## What this is

Two new pages, "5 Stars Ships" and "4 Stars Ships," reachable from a new
"Ships" flyout group in the sidebar nav (the app's first nested/flyout
nav item — see "The nav flyout" below). Each page lists the player's
rarity-5 (or rarity-4) ships that are **not yet fully leveled**, one row
per ship, sorted so the ships closest to completion rise to the top —
the ship-domain analog of the crew pages' "what still needs my
attention" framing.

Ships live at `player.character.ships` — a sibling array to
`player.character.crew`, never previously read by this app. This is the
first non-crew, non-collections top-level domain (`ships/`), following
the same "type only what you use" and defensive-cast discipline as
`crew/` and `collections/`.

## Verified facts about the ship data (grounded against `example-data.json`)

- 128 ships total. `max_level` is 1:1 with `rarity`: rarity 1→`max_level`
  5, 2→6, 3→7, 4→8, 5→9.
- **Every rarity-1/2/3 ship in the sample already has `level ===
  max_level`** — confirms the user's expectation that those tiers need no
  page; only rarity 4 and 5 have incomplete ships (18 and 55
  respectively, in the sample).
- **The game's on-screen level is the raw JSON value plus one, out of
  `max_level` plus one.** Confirmed against two independent real
  examples given by the user: H.M.S. Bounty is `level: 9, max_level: 9`
  in the JSON and was described as "10/10"; U.S.S. Reliant is `level: 8,
  max_level: 9` and was described as "9/10." Both match `display =
  raw + 1` exactly.
- **Current schematics owned** are not on the ship object — they live in
  `player.character.items`, as `type: 8` entries whose `archetype_id`
  equals the ship's own `schematic_id`. Verified: U.S.S. Reliant
  (`schematic_id: 8176`) has a matching item with `quantity: 1755`; its
  `schematic_gain_cost_next_level` is `1800` — i.e. 1755/1800 toward next
  level, matching the "current/total" idea directly.
- **5 of 73 incomplete rarity-4/5 ships have no matching item at all**
  (all are `level: 0`, i.e. zero schematics collected yet) — needs a
  `?? 0` fallback, not an error.
- `schematic_gain_cost_next_level` is `-1` for every already-maxed ship
  in the sample (0 exceptions) and a real positive number for every
  incomplete one (0 exceptions) — a clean sentinel, same convention as
  other `-1`/`?? []` fail-closed guards already in this codebase.
- No incomplete ship in the sample has `owned >= needed` (0 exceptions) —
  i.e. no ship is sitting on enough schematics to level up but hasn't;
  not a case this feature needs to special-case.
- `ship.id` is unique across all 128 ships (verified) — used as the table
  row key, same role `crew.id` plays for `CrewTable`.

## Data layer

New `client/src/types/ship.ts`:

```ts
export interface Ship {
  id: number;
  symbol: string;
  name: string;
  rarity: number;
  level: number;
  max_level: number;
  schematic_id: number;
  schematic_gain_cost_next_level: number; // -1 sentinel when already maxed
}
```

`client/src/types/item.ts`'s `OwnedItem` gains one optional field — the
trigger for a deferred-issues backlog entry that already anticipated
this ("`OwnedItem` doesn't track `quantity`"):

```ts
export interface OwnedItem {
  archetype_id: number;
  quantity?: number;
}
```

New `client/src/ships/getters.ts`, mirroring `crew/getters.ts`'s
defensive-cast style exactly:

```ts
export function getShipList(data: PlayerData): Ship[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const ships = character?.ships;
  return Array.isArray(ships) ? (ships as Ship[]) : [];
}

export function isShipMaxed(ship: Ship): boolean {
  return ship.level === ship.max_level;
}

export function getShipSchematicsOwned(ship: Ship, items: OwnedItem[]): number {
  return items.find((item) => item.archetype_id === ship.schematic_id)?.quantity ?? 0;
}

export function getShipDisplayLevel(ship: Ship): string {
  return `${ship.level + 1}/${ship.max_level + 1}`;
}

export function getShipSchematicsDisplay(ship: Ship, items: OwnedItem[]): string {
  return `${getShipSchematicsOwned(ship, items)}/${ship.schematic_gain_cost_next_level}`;
}
```

`getShipSchematicsOwned` is the direct ships-domain analog of
`getMissingEquipmentArchetypeIds`/`areAllMissingItemsOwned` — same
"cross-reference the separately-fetched items array" shape, same `?? 0`
fail-closed guard for ships with no matching item at all.
`getShipDisplayLevel`/`getShipSchematicsDisplay` follow the existing
"computed display value lives in `getters.ts`" precedent (compare
`getEquipmentSlotsRemaining`).

`client/src/ships/filters.ts`:

```ts
export function filterIncompleteShipsByRarity(ships: Ship[], rarity: number): Ship[] {
  return ships.filter((s) => s.rarity === rarity && !isShipMaxed(s));
}
```

Reuses the existing `getOwnedItems(data)` from `crew/getters.ts`
unmodified — ships pages call it directly, the same pragmatic
cross-domain reuse this project has repeatedly chosen over refactoring
mid-feature (e.g. `FrozenDuplicatesPage` importing from
`collections/getters.ts`).

## Sorting

`client/src/ships/sorters.ts`, importing `combineComparators`/
`Comparator<T>` from `crew/sorters.ts` (reused as-is, not extracted —
explicit decision, consistent with the pragmatic-reuse pattern above):

```ts
export function byLevelDesc(a: Ship, b: Ship): number {
  return b.level - a.level;
}

export function byLevelProgressDesc(a: Ship, b: Ship): number {
  return (b.level / b.max_level) - (a.level / a.max_level);
}

export function byMissingSchematicsAsc(items: OwnedItem[]): Comparator<Ship> {
  return (a, b) => {
    const remainingA = a.schematic_gain_cost_next_level - getShipSchematicsOwned(a, items);
    const remainingB = b.schematic_gain_cost_next_level - getShipSchematicsOwned(b, items);
    return remainingA - remainingB;
  };
}

export function byNameAsc(a: Ship, b: Ship): number {
  return a.name.localeCompare(b.name);
}
```

Composed at the page level as
`combineComparators(byLevelDesc, byLevelProgressDesc, byMissingSchematicsAsc(items), byNameAsc)`
— level first (higher first), then level-completion fraction (closer to
its own ceiling first), then remaining schematics (fewer first), then
name as the final tiebreak. Matches the user's specified rule set
exactly, including the worked example (a level-8-of-10 ship ranks below
a level-8-of-9 ship, since 8/9 > 8/10).

**Documented, not a defect:** `max_level` is 1:1 with `rarity` in the
real data (every rarity-5 ship has `max_level: 9`, every rarity-4 ship
has `max_level: 8`), and each page only ever shows one rarity. So on
this app's current pages, `byLevelProgressDesc` can never produce an
ordering different from `byLevelDesc` alone — a level tie is already a
progress-fraction tie, since the denominator is constant within a page.
Implemented anyway, exactly as specified, because it's correct general
logic that would matter the moment a page ever mixed rarities — flagged
here so a future session doesn't "clean up" it as dead code. Same
category as the already-documented unexercised branch in
`isCollectionUpgradable`'s `||`.

## Table and pages

`client/src/ships/ShipsTable.tsx` — a shared renderer, same shape as
`CrewTable`: `#` / `Ship` / `Level` / `Schematics` columns (`Level` via
`getShipDisplayLevel`, `Schematics` via `getShipSchematicsDisplay`). No
Stars/rarity column — every row on a given page shares the same rarity
(the page title already says "5 Stars"/"4 Stars"), so it would be
redundant, unlike the crew pages where rarity varies row-to-row. Takes
`ships: Ship[]` and `items: OwnedItem[]` as props.

Page structure mirrors `FrozenDuplicatesPage`'s parameterized-internal +
thin-wrapper pattern exactly:

- **`client/src/pages/ShipsPage.tsx`** (new, internal — not directly
  routed) — takes `rarity: number` and `title: string` props. Same
  `usePlayerData()` + loading/error/empty-state/title scaffold every
  existing page uses. Composes
  `filterIncompleteShipsByRarity(getShipList(data), rarity)` with the
  sort above and renders `ShipsTable`.
- **`client/src/pages/FiveStarsShipsPage.tsx`** / **`FourStarsShipsPage.tsx`**
  — thin wrappers (rarity=5/title="5 Stars Ships" and rarity=4/title="4
  Stars Ships"), zero logic, same shape as
  `FourStarsDuplicatesPage`/`FiveStarsDuplicatesPage`.

Routes: `/5-stars-ships`, `/4-stars-ships`.

## The nav flyout

The app's first nested nav item. `AppLayout.tsx`'s `NAV_ITEMS` changes
from a flat array to a mix of plain items and one group:

```ts
type NavItem = { label: string; path: string };
type NavGroup = { label: string; children: NavItem[] };

const NAV_ITEMS: (NavItem | NavGroup)[] = [
  // ...existing 8 flat items, unchanged...
  { label: 'Ships', children: [
    { label: '5 Stars Ships', path: '/5-stars-ships' },
    { label: '4 Stars Ships', path: '/4-stars-ships' },
  ] },
];
```

"Ships" is appended at the end, matching how every prior feature has
appended to nav in shipped order. The two children are ordered 5-star
then 4-star, per explicit user choice (overriding this project's usual
"lower number first" convention for nav ordering, specifically for this
group).

New `NavGroupItem` component renders the "Ships" row — a small
right-chevron affordance icon, `cursor: default`, no `onClick`/no route
— plus an MUI `Popper` anchored to it, `placement="right-start"`, so it
opens outside the drawer's right edge.

**Technical choice:** the permanent `Drawer`'s paper has `overflow-y:
auto`, which would clip a flyout rendered inline in the DOM (MUI's
`disablePortal` option), so the `Popper` stays portal-based (the
default) — it renders into `document.body`. Consequence: hover events on
the flyout panel don't bubble to the trigger through the DOM tree the
way a normal child would, since a portaled subtree isn't a DOM
descendant of the trigger. Handled with a shared open/close state and a
short cancelable close delay (~150ms): entering or focusing *either* the
trigger or the panel opens it and cancels any pending close; leaving or
blurring *either* schedules the delayed close. This tolerates diagonal
mouse movement from trigger to panel and Tab-ing from the trigger into a
flyout item without flicker-closing. Clicking a child item navigates and
closes the flyout immediately. `Escape` closes it while focus is inside.

## Testing / verification

Same as every prior feature — no automated test framework (project-wide,
repeatedly-reaffirmed choice). Verification is TypeScript strict mode +
ESLint + a throwaway `client/src/ships/__verify.ts` script run via `npx
tsx` against real `example-data.json` (confirming the incomplete-ship
counts and sort order above), deleted before committing, plus manual
dev-server checks of both pages and the flyout's hover/focus/click
behavior.
