# Hide Buyback-State Crew from Duplicate Pages — Design Spec

## Goal

The 4 Stars Duplicates and 5 Stars Duplicates pages currently show crew
whose archetype is already frozen (a duplicate you could trash), but they
still show crew the user has *already* trashed in-game — the game moves a
trashed crew member into a temporary "buyback" state (recoverable for a
price, for a limited time) rather than deleting it instantly, so it still
exists in the player's raw crew data with `in_buy_back_state: true`. The
user doesn't want to see those on the duplicate pages, even though they're
technically still recoverable.

## Root cause / current behavior

`filterFrozenDuplicates` (`client/src/crew/filters.ts`) is the single
filter both duplicate pages route through (via `FrozenDuplicatesPage.tsx`,
parameterized by `maxRarity`). It currently only checks archetype
membership in the frozen set and rarity — it has no concept of buyback
state, because `in_buy_back_state` isn't part of the `CrewMember` type at
all today (though it's present on every raw crew record from the game
API).

## Confirmed against real, current data

`example-data.json` (the repo's static reference export, dated Aug 4) is
stale for this feature — it happens to have zero `in_buy_back_state: true`
crew, which would make this change look like a no-op if verified against
it. The actually-current data is `server/data/player-cache.json`
(refreshed same-day), which the running dev server serves from. Verified
directly against that file, replicating the app's real duplicate-detection
logic (crew whose `archetype_id` is in `stored_immortals`, at
`max_rarity=4`):

| Name | `in_buy_back_state` |
|---|---|
| Captain Janeway | false |
| Anxious Kirk | false |
| Indignant Seven | false |
| Bankrobber Shaxs | true |
| Henry Starling | true |
| Test Pilot Archer | true |
| Symbiont Pool Jadzia | true |
| Warship Yar | true |
| Dr. Crusher | true |
| Academy Speech Burnham | true |

10 currently shown, 7 of which are in buyback state. Filtering those out
leaves exactly `{Captain Janeway, Anxious Kirk, Indignant Seven}`, matching
what the user independently reported from the live app. Also confirmed:
`in_buy_back_state` is present as a real boolean (never missing/undefined)
on all 608 crew records in this same file, so it's safe to type as
required, not optional. The 5 Stars Duplicates page currently has zero
duplicates in this data either way, so no visible change there today, but
the fix applies identically for correctness going forward.

## Non-goals

- No change to any other page — Collections, QPs, Overview counts, and
  the main crew-tier pages (3/4 Stars, 5 Stars, 4/4 Stars, etc.) all
  continue to count buyback-state crew exactly as today. This is scoped
  to the 2 duplicate pages only, per the user's explicit request.
- No UI/messaging changes — the existing "No duplicate crew at this
  rarity" empty state on `FrozenDuplicatesPage` already correctly covers
  the case where filtering removes everything.
- No new shared filter/getter helper — `filterFrozenDuplicates` has
  exactly one call site (both duplicate pages route through the same
  `FrozenDuplicatesPage` component), so inlining the one added condition
  directly is simpler than extracting a helper nothing else would call
  (YAGNI).

## Design

### `client/src/types/crew.ts`

Add one field to the `CrewMember` interface, in the same style as the
existing fields (a plain scalar, no comment needed — the raw field name
is already self-explanatory and matches the game API's own naming):

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
  portrait?: DatacoreAsset;
  q_bits: number;
  in_buy_back_state: boolean;
}
```

### `client/src/crew/filters.ts`

`filterFrozenDuplicates` gets one added condition, `&&
!c.in_buy_back_state`:

```ts
export function filterFrozenDuplicates(crew: CrewMember[], frozenArchetypeIds: Set<number>, maxRarity: number): CrewMember[] {
  return crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && c.max_rarity === maxRarity && !c.in_buy_back_state);
}
```

No other file changes. `FrozenDuplicatesPage.tsx`, `FourStarsDuplicatesPage.tsx`,
and `FiveStarsDuplicatesPage.tsx` are all untouched — they already call
`filterFrozenDuplicates` and will pick up the new behavior automatically.

## Error handling

None new — pure filter-predicate addition on an existing, always-present
boolean field. No new failure modes.

## Testing / verification plan

No automated test framework exists in this project (established,
repeated choice). Verification is a data-driven check against the real,
current `server/data/player-cache.json` (not the stale
`example-data.json`):

- Re-run the exact check from the confirmation above: filtering the
  4-star duplicates by `!in_buy_back_state` produces exactly
  `{Captain Janeway, Anxious Kirk, Indignant Seven}` (3 of the 10
  previously shown), and the 5-star duplicates page still correctly shows
  zero results (unaffected, since it already had none).
- Build (`npm run build -w client`) / lint (`npm run lint -w client`)
  clean — adding a required field to `CrewMember` must not break any
  other code that constructs or narrows that type; a clean `tsc` build is
  the check for this (the type is only ever read from data cast at
  runtime via `getCrewList`, never constructed literal elsewhere in the
  codebase, so no other call site should need changes — the build is
  what proves that assumption).
- Real-browser check: `/4-stars-duplicates` shows exactly 3 rows (the
  three above) against the live dev server's real data; `/5-stars-duplicates`
  shows its correct (currently empty) state.
- Confirm no console errors.
