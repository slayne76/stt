# Overview page: "Missing Favorite Flag" table — Design

**Date:** 2026-08-16
**Status:** Approved

## Problem

In-game, a crew member can be flagged "favorite" (heart icon), which also
prevents accidental deletion/freezing. The user flags almost every crew
member they intend to level up and immortalize, so the exceptions —
crew that are NOT flagged — are the ones worth reviewing (in case they
forgot to flag one they actually care about). They want a new Overview
page table listing exactly those crew.

## Investigation

The raw field is `favorite: boolean` on each crew member in
`player.character.crew` — confirmed directly against
`server/data/player-cache.json` by finding "Beach Day Uhura" (the user's
own example of a crew they deliberately unflagged): `"favorite": false`.

**Full real-data sweep, 16 total crew with `favorite === false`:**
- **7 active (not in buyback state)** — confirmed exactly matching the
  user's own report: Beach Day Uhura, Mirror 'Smiley' O'Brien ×3,
  Commander Scott ×3 (the same three archetypes/counts as the Duplicates
  page's real data — see feature 47).
- **9 already in buyback state** (trashed in-game, so the flag is moot):
  Lt. Naomi Wildman, U.S.S. Cabot Janitor, Brainless Spock, Nurse Paris,
  L'Rell, Acting Ensign Crusher, Quarren of the Kyrian, Jinaal Culber,
  Ensign Sutter. **Confirmed with the user: excluded from this table**,
  matching this project's established buyback-exclusion convention
  (Duplicates page, QPs page).

## Design

### 1. `CrewMember` gains `favorite: boolean`

Same safe-addition pattern as `in_buy_back_state`/`skills` — the raw data
already has it; `client/src/types/crew.ts` just didn't declare it. No
`CrewMember` object-literal constructors exist anywhere in the codebase
(confirmed pattern from prior features), so adding a required field is
safe.

### 2. New filter: `filterMissingFavorite`

`client/src/crew/filters.ts`:

```ts
export function filterMissingFavorite(crew: CrewMember[]): CrewMember[] {
  return crew.filter((c) => !c.favorite && !c.in_buy_back_state);
}
```

### 3. Reuses the existing `CrewTable` component — no new table component

Since this lists *owned* crew (`CrewMember`, with real Level/Stars/
equipment data), the appropriate columns are the standard owned-crew set
`CrewTable` already renders (`#`/Image/Stars/Name/Level/Items to equip/
Total collections/Collections names, `showCollectionsNames={true}`) —
matching "5 Stars Crew" and the other crew-listing pages, not
`MissingCrewTable`'s catalog-oriented columns (which include `DataScore`,
a field that doesn't exist for crew the user already owns). Sort:
`defaultCrewComparator`, matching every other `CrewTable` consumer.

### 4. New Overview section, positioned after "Missing Crew recap"

This table depends only on player data (`crew.favorite`,
`crew.in_buy_back_state`) — **not** the crew catalog. It's placed
immediately after the existing "Missing Crew recap" table (both gated on
`!loading && !error && identity` only) and before the `showMissingTables`-
gated block (Missing 4 Stars / Base Skill Bonus / Proficiency Bonus,
which all *do* depend on catalog data) — so it renders as soon as player
data loads, without waiting on the separate, sometimes-slower catalog
fetch.

Styled like the existing "Missing 4 Stars" sections (title + count, search
bar on the same row, no-results message when a search yields zero):

```tsx
<Divider sx={{ my: 2 }} />
<Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
  <Typography variant="h5">
    Missing Favorite Flag ({filteredCrew.length} of {missingFavoriteCrew.length})
  </Typography>
  <TableSearchBar
    value={query}
    onChange={setQuery}
    ariaLabel="Search Missing Favorite Flag by name"
  />
</Stack>
{active && filteredCrew.length === 0 ? (
  <Typography color="text.secondary">No results found for your search.</Typography>
) : (
  <CrewTable crew={filteredCrew} collections={collectionsList} showCollectionsNames={true} />
)}
```

Title: **"Missing Favorite Flag"** (the user's confirmed choice).

## Non-goals

- No change to `CrewTable.tsx` itself — reused exactly as-is, no new
  columns or props.
- No change to how favorite/buyback state is computed or displayed
  anywhere else in the app.
- No UI to toggle the favorite flag itself — this is a read-only review
  list, matching the "surface, don't hide" precedent from the Duplicates
  page (feature 47's design doc).

## Verification plan

- A throwaway script against the real, live-refreshed
  `server/data/player-cache.json` independently re-derives
  `filterMissingFavorite`'s output and confirms it matches the 7 real
  crew named above (Beach Day Uhura, Mirror 'Smiley' O'Brien ×3,
  Commander Scott ×3) — and confirms none of the 9 buyback-state crew
  appear.
- Real-browser check against the running dev server: `/` (Overview)
  renders the new "Missing Favorite Flag" section between "Missing Crew
  recap" and the Divider before "Missing 4 Stars (In Portal)", with
  exactly 7 rows matching the real names above, search works, and the
  rest of the page is unaffected.
