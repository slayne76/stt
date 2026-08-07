# QPs Page — Design

## What this is

A new page, "QPs" (Quantum/Q Bit Points), added to the "Crew" nav flyout
group. Surfaces which already-immortalized crew are closest to their
next Q Bit level (QL), so the player can prioritize which crew to run
Q Bit missions for. This is a genuinely new data domain for this
app — `crew.q_bits`, never previously read — not a variant of an
existing page.

## The mechanic, verified against real data

**`q_bits` is a per-crew field present on every crew object** (all 641
in a fresh live pull, not the older `example-data.json`), but is
**non-zero on immortalized crew only** — verified exhaustively: 131 of
132 immortalized crew have `q_bits > 0`; the one exception (Amand Rauth
Pike) is genuinely at `0`. Every one of the 509 non-immortalized crew
has `q_bits === 0`. This is the reason `filterQPEligible` below gates on
`isImmortalized(crew)` explicitly, not just "`q_bits` below the max
threshold" — without that gate, all 509 not-yet-immortalized crew would
incorrectly appear as "QL0, needs 100."

**`q_bits` is cumulative and uncapped** — it keeps growing past the
"maxed" threshold forever (real values observed up to 42,465). QL4
("maxed," excluded from this page per explicit request) is reached at
1300 and everything above that is still QL4, just with a higher banked
total that this page has no reason to show.

**QL boundaries, verified against the full real dataset, not just the
worked examples the user provided:**

| QL | Cumulative `q_bits` range | Points needed *within* this level |
|---|---|---|
| 0 | 0 – 99 | 100 |
| 1 | 100 – 199 | 100 |
| 2 | 200 – 499 | 300 |
| 3 | 500 – 1299 | 800 |
| 4 (excluded from this page) | ≥ 1300 | — |

Confirmed by computing the full live 63-entry "immortalized and not yet
QL4" list from a fresh `POST /api/player/refresh` pull and reproducing
the user's independently-hand-tracked list almost exactly, including
matching sort order. Two real discrepancies surfaced and were resolved
in favor of the live data (exactly the failure mode a hand-tracked list
is expected to accumulate, not a flaw in the mechanic description):
"Chances Taken Kirk" is actually QL3 at `1275/1300` (matches the other
five 1275/1300 entries; the user's list had it at QL2), and "Colonel
West" is actually at `80/100`, not `75/100`. One omission: "Dragon's
Breath Rutherford" also belongs in the list at `75/100` and wasn't in
the user's manual tracking.

**Missions grant 25 points on success, 5 on failure** (per the user;
not independently derivable from a single data snapshot, since the
payload has no mission-history log — taken as given, consistent with
every observed real `q_bits` value in the sample being a multiple of 5).
"Rounds left" is therefore `Math.ceil(pointsNeeded / 25)` — the
successful-run count, matching every one of the user's worked examples
exactly (e.g. 20 points needed → 1 round; 100 points needed → 4 rounds;
25 points needed → 1 round, not 0, since a partial round still requires
a full run).

## Sort order, reproduced exactly against live data

Two groups, in this order:
1. Crew needing **more than 25 points** to their next level (i.e. more
   than one successful round away) — sorted QL descending, then
   `q_bits` descending, then name ascending.
2. Crew needing **25 points or fewer** ("on hold," per the user — kept
   at the bottom deliberately so a "one run away" crew doesn't
   dominate the top of the list when the player is intentionally
   saving them for a specific event) — same three-key sort within the
   group.

```ts
export function byQPOnHoldAsc(a: CrewMember, b: CrewMember): number {
  const aOnHold = getQPPointsNeeded(a) <= 25 ? 1 : 0;
  const bOnHold = getQPPointsNeeded(b) <= 25 ? 1 : 0;
  return aOnHold - bOnHold;
}
```

Composed as `combineComparators(byQPOnHoldAsc, byQPLevelDesc,
byQPPointsDesc, byNameAsc)` — same composition pattern every other page
already uses, reusing the existing `byNameAsc` and `combineComparators`/
`Comparator<T>` (from `lib/comparator.ts`) unmodified.

## New crew-domain logic

**`types/crew.ts`** gains one field, typed required (not optional) —
verified present on all 641 real crew, matching this project's
convention of typing fields as required based on what real data always
contains:

```ts
export interface CrewMember {
  // ...existing fields...
  q_bits: number;
}
```

**`crew/getters.ts`** gains four functions and one module-private
constant, mirroring the `ships/getters.ts` `getShipDisplayLevel`/
`getShipSchematicsDisplay`/`getShipSchematicsProgress` naming precedent
(a level getter, a display-string getter, a numeric progress getter):

```ts
const QP_LEVEL_THRESHOLDS = [100, 200, 500, 1300]; // cumulative q_bits to REACH QL1/2/3/4

export function getQPLevel(crew: CrewMember): number {
  for (let i = 0; i < QP_LEVEL_THRESHOLDS.length; i++) {
    if (crew.q_bits < QP_LEVEL_THRESHOLDS[i]) return i;
  }
  return QP_LEVEL_THRESHOLDS.length; // 4, maxed
}

function getQPLevelThreshold(crew: CrewMember): number {
  const level = getQPLevel(crew);
  return QP_LEVEL_THRESHOLDS[level] ?? QP_LEVEL_THRESHOLDS[QP_LEVEL_THRESHOLDS.length - 1];
}

export function getQPProgressDisplay(crew: CrewMember): string {
  return `${crew.q_bits}/${getQPLevelThreshold(crew)}`;
}

export function getQPPointsNeeded(crew: CrewMember): number {
  if (getQPLevel(crew) >= QP_LEVEL_THRESHOLDS.length) return 0;
  return getQPLevelThreshold(crew) - crew.q_bits;
}

export function getQPRoundsLeft(crew: CrewMember): number {
  return Math.ceil(getQPPointsNeeded(crew) / 25);
}
```

`getQPLevelThreshold` is not exported — only `getQPProgressDisplay`
needs it, matching the existing pattern of keeping single-use helpers
private (e.g. `cachedFilePath`/`missingMarkerPath` in
`server/src/assetCache.ts`).

**`crew/filters.ts`** gains one filter:

```ts
export function filterQPEligible(crew: CrewMember[]): CrewMember[] {
  return crew.filter((c) => isImmortalized(c) && getQPLevel(c) < 4);
}
```

**`crew/sorters.ts`** gains three comparators (shown above and below):

```ts
export function byQPLevelDesc(a: CrewMember, b: CrewMember): number {
  return getQPLevel(b) - getQPLevel(a);
}

export function byQPPointsDesc(a: CrewMember, b: CrewMember): number {
  return b.q_bits - a.q_bits;
}
```

## New components

**`crew/QPsTable.tsx`** — its own dedicated table, not a reuse of
`CrewTable` (this project's established convention: one table component
per distinct column set, `CrewTable`'s column set is "intentionally
fixed," per `docs/PROJECT_STATE.md`). Columns: `#`, `Image` (the
existing `Thumbnail` component, `crew.portrait`), `Stars` (the existing
`StarRating`, `rarity`/`max_rarity` — will always render fully-lit
since every row is by definition already immortalized, same as every
other page that only shows immortalized crew), `Name`, `QL`
(`` `${getQPLevel(c)}/4` ``), `QPs` (`getQPProgressDisplay(c)`), `Points
left` (`` `-${getQPPointsNeeded(c)}` ``), `Rounds left` (``
`-${getQPRoundsLeft(c)}` ``) — the last two rendered as negative numbers
per explicit confirmation, matching the user's own tracking convention.

**`pages/QPsPage.tsx`** — uses the existing `PageShell`
(`layout/PageShell.tsx`), same shape as every other list page:

```tsx
function QPsPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const crew = data
    ? sortCrew(
        filterQPEligible(getCrewList(data)),
        combineComparators(byQPOnHoldAsc, byQPLevelDesc, byQPPointsDesc, byNameAsc)
      )
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="QPs"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No crew need QP leveling."
    >
      <QPsTable crew={crew} />
    </PageShell>
  );
}
```

## Routing and nav

- New route `/qps` in `App.tsx`.
- New entry `{ label: 'QPs', path: '/qps' }` **appended to the end** of
  the existing "Crew" flyout group's children (matching this project's
  established "new item appended, existing ones not reordered"
  convention) — the group grows from 6 to 7 children, which
  `NavGroupItem` already handles with zero component changes (proven at
  6 children by the Crew nav group feature; the newly-added max-height/
  scroll fallback means a 7th item is safe too).

## Scope

New: `client/src/crew/QPsTable.tsx`, `client/src/pages/QPsPage.tsx`.
Modified: `client/src/types/crew.ts` (one field), `client/src/crew/getters.ts`
(four functions), `client/src/crew/filters.ts` (one function),
`client/src/crew/sorters.ts` (three functions), `client/src/App.tsx`
(one route), `client/src/layout/AppLayout.tsx` (one nav entry). No
server changes — `q_bits` is already present in the existing
`/api/player` payload, nothing new to fetch or proxy.

## Verification

This project has no automated test framework (deliberate, project-wide
choice). This feature introduces real new logic (not a pure move), so
verification is the full pattern: a throwaway `crew/__verify.ts` script
(deleted before commit) asserting `getQPLevel`/`getQPProgressDisplay`/
`getQPPointsNeeded`/`getQPRoundsLeft`/`filterQPEligible` against real
known examples from `example-data.json` (this project's standard
fixture for this kind of script — the QL threshold constants are static
game rules, not per-player data, so the older snapshot is equally valid
for proving the *code* correctly implements the already-verified
formula), plus interactive browser checks via the `playwright` MCP
tooling against a real running dev server with live data: navigate to
`/qps`, confirm the title/count, confirm the sort order matches the
two-group/QL-desc/points-desc/name-asc rule on at least one tie-broken
case, confirm the "Crew" nav flyout now shows 7 items including "QPs,"
and confirm no QL4 crew appear (spot-check a few `q_bits`-heavy real
names against the rendered table).
