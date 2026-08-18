# "Dilemmas" page — Design

**Date:** 2026-08-18
**Status:** Approved

## Problem

Players discover dilemma missions while playing — each pops with 2-3 choices, and some choices chain into a "Part 2" / "Part 3" continuation while others terminate with a reward (sometimes a guaranteed unique crew member, sometimes a percentage-chance pull from a pool of crew). None of this is currently computable from the tracker's live player/collections data — it's knowledge players gather by hand. The tracker needs a new "Dilemmas" page that renders this hand-gathered data in the same visual style as the rest of the app, sourced from a static, hand-maintained JSON file so it can later be swapped for computed data without changing the frontend.

## Approach

A new top-level nav entry **"Dilemmas"**, placed after "Collections" (last in the top-level list), routing to `/dilemmas`. The page fetches a static JSON document from a new `GET /api/dilemmas` endpoint and renders it as a table matching the existing `CollectionsTable` visual conventions (MUI `Table`/`Paper`, striped rows, `BLOCK_BOUNDARY_COLOR` dividers between logical groups).

### Data model

New git-tracked file `server/src/data/dilemmas.json` (not `server/data/` — that whole directory is gitignored player-cache scratch; `server/src/` is tracked, and `resolveJsonModule` is already enabled in `server/tsconfig.json`, so `tsc` copies the JSON straight into `dist/data/dilemmas.json` on build, right alongside the compiled routes — no filesystem-read plumbing needed).

```ts
interface Dilemma {
  id: string;          // slug, e.g. "a-higher-duty-part-3"
  name: string;         // full display name, e.g. "A Higher Duty, Part 3"
  chainName: string;    // grouping/sort key — "A Higher Duty" for all 3 parts;
                         // for a standalone dilemma, equal to its own `name`
  partNumber: number;   // order within the chain (1, 2, 3…); always 1 for standalone
  choices: Choice[];    // 2 or 3 entries, letters 'A'..'C'
}

interface Choice {
  letter: 'A' | 'B' | 'C';
  description: string;
  leadsToDilemmaId?: string;  // id of the dilemma this choice unlocks, if any
  rewards?: Reward[];         // omitted/empty if this choice gives nothing
}

interface Reward {
  crewArchetypeId: number;  // resolved against the crew catalog for portrait + name
  dropRatePercent: number;
  showName: boolean;        // true = show name under the icon; false = icon only
}
```

Mirrored as a client-side type (`client/src/types/dilemma.ts`) — this repo's existing convention (see `CatalogEntry` on both sides) duplicates small cross-cutting types per side rather than sharing a package.

### Seed data

The four dilemmas given, with crew names resolved to `archetype_id` by exact-name match against `crew-catalog-cache.json` (all 13 names matched on the first pass):

| Name | archetype_id |
|---|---|
| Fierce Guinan | 6281 |
| Dr. Leonard McCoy | 5882 |
| Vori Defender Chakotay | 18157 |
| Admiral Black | 21976 |
| One Way Ticket Chapel | 23481 |
| Grady | 24025 |
| Dr. Simon van Gelder | 24853 |
| Bridge Beverly Crusher | 26216 |
| The Subspace Abductor | 28013 |
| Peak Efficiency Otherford | 29195 |
| Talos IV J.M. Colt | 31199 |
| Q'Mau Rayner | 31546 |
| Jamin | 32154 |

```json
{
  "dilemmas": [
    {
      "id": "a-higher-duty-part-1",
      "name": "A Higher Duty, Part 1",
      "chainName": "A Higher Duty",
      "partNumber": 1,
      "choices": [
        { "letter": "A", "description": "Give a rousing speech in support of the diplomat.", "leadsToDilemmaId": "a-higher-duty-part-2" },
        { "letter": "B", "description": "Give a neutral speech to avoid sides.", "leadsToDilemmaId": "a-higher-duty-part-2" },
        { "letter": "C", "description": "Refuse to speak at the diplomat's gala." }
      ]
    },
    {
      "id": "a-higher-duty-part-2",
      "name": "A Higher Duty, Part 2",
      "chainName": "A Higher Duty",
      "partNumber": 2,
      "choices": [
        { "letter": "A", "description": "Suggest a lenient sentence in the hopes of reform." },
        { "letter": "B", "description": "Suggest a harsh sentence in light of the consequences of his theft.", "leadsToDilemmaId": "a-higher-duty-part-3" }
      ]
    },
    {
      "id": "a-higher-duty-part-3",
      "name": "A Higher Duty, Part 3",
      "chainName": "A Higher Duty",
      "partNumber": 3,
      "choices": [
        { "letter": "A", "description": "Disable his ship before he can harm the colony.", "rewards": [{ "crewArchetypeId": 6281, "dropRatePercent": 100, "showName": true }] },
        { "letter": "B", "description": "Talk him down before he or anyone else is hurt.", "rewards": [{ "crewArchetypeId": 5882, "dropRatePercent": 100, "showName": true }] }
      ]
    },
    {
      "id": "lost-among-the-stars",
      "name": "Lost Among the Stars",
      "chainName": "Lost Among the Stars",
      "partNumber": 1,
      "choices": [
        {
          "letter": "A",
          "description": "Search for the ship or any other survivors.",
          "rewards": [
            { "crewArchetypeId": 18157, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 21976, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 23481, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 24025, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 24853, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 26216, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 28013, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 29195, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 31199, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 31546, "dropRatePercent": 2, "showName": false },
            { "crewArchetypeId": 32154, "dropRatePercent": 2, "showName": false }
          ]
        },
        { "letter": "B", "description": "Tell the survivor I cannot take the risk." }
      ]
    }
  ]
}
```

### Server

`server/src/routes/dilemmas.ts` — a small router with one route, `GET /api/dilemmas`, that imports and returns the JSON above directly (no upstream fetch, no cache-freshness logic — unlike `catalog.ts`, this data isn't fetched live). Registered in `server/src/index.ts` alongside the other routers.

### Client

- `client/src/types/dilemma.ts` — the three interfaces above.
- `client/src/api/dilemmasApi.ts` — `fetchDilemmas(): Promise<{ dilemmas: Dilemma[] }>`.
- `client/src/hooks/useDilemmas.ts` — a self-contained `useState`/`useEffect` hook (fetch-on-mount, `{ data, loading, error, refresh }`). No Context/Provider: only one page ever consumes this, unlike `CrewCatalogContext` which is shared by more than one page — a provider here would be unused ceremony.
- `client/src/dilemmas/getters.ts`:
  - `dilemmaHasRelation(dilemma): boolean` — true if any choice has `leadsToDilemmaId` set or a non-empty `rewards`.
  - `getChoiceIcon(dilemma, choice): 'check' | 'x' | 'circle'`:
    - `'check'` if the choice has `leadsToDilemmaId` **or** a non-empty `rewards` (a reward counts as a "positive" outcome exactly like continuing the chain).
    - else `'x'` if `dilemmaHasRelation(dilemma)` is true (some other choice in this dilemma does lead onward or reward — this choice is a dead end within an otherwise-connected dilemma).
    - else `'circle'` — the whole dilemma has zero reward and zero chain link on any choice (fully standalone, no relation at all).
  - `sortedDilemmas(dilemmas): Dilemma[]` — sorted by `chainName` (alphabetical) then `partNumber` (ascending). This single sort produces both the alphabetical ordering and the chain-adjacency needed for grouping.
- `client/src/dilemmas/DilemmasTable.tsx` — `TableContainer`/`Paper`/`Table`, columns **#, Name, Choices, Reward, Drop Rate**:
  - **Choices**: dense MUI `List`, one line per choice — icon (`CheckCircleIcon` green / `CancelIcon` red / a solid grey filled circle) + `"A: <description>"`.
  - **Reward**: one flex-wrap row per dilemma, containing one group per reward-bearing choice — `"A:"` label followed by that choice's reward crew as side-by-side `Thumbnail`s (portrait via `imageUrlPortrait` from the crew catalog, looked up by `archetypeId`, same pattern `FrozenCrewTable.tsx` already uses: `<Thumbnail url={`${ASSET_BASE_URL}/${entry.imageUrlPortrait}`} />`). Groups for different choices sit side by side in the same row and only wrap to a new line if the column is too narrow to fit both — never stacked by design. Name is shown under the icon only where `showName` is true. A choice with no reward contributes no group; a dilemma with no rewards anywhere shows an em dash.
  - **Drop Rate**: if the row's reward-bearing choices all share one rate, show it once (`"100%"`); if they differ, show one line per choice matching the Reward column's groups (`"A: 100%"` / `"B: 2%"`).
  - Visual chain grouping: a `BLOCK_BOUNDARY_COLOR` bottom border under the **last** row of each `chainName` group (the same divider idiom `CollectionsTable` uses between collection blocks) — visually separates "A Higher Duty"'s 3 rows as one block from the next chain/standalone dilemma.
- `client/src/pages/DilemmasPage.tsx` — `PageShell` fed by `useDilemmas()` + `useCrewCatalog()` loading/error state (not `usePageData`, since this page has nothing to do with player data). No search bar or pagination in this first version — 4 rows today; both are easy to add later if the list grows.
- `client/src/routes.tsx` — new top-level `{ label: 'Dilemmas', path: '/dilemmas', element: <DilemmasPage /> }` entry, appended after the existing `Collections` entry.

## Verified via static mockup

A throwaway standalone HTML mockup (real crew portraits pulled from the running dev server, no app code touched) was built and iterated on with the user before writing this spec — three rounds of visual correction landed on the rules above:
1. Reward groups for multiple choices sit side by side, not stacked.
2. A reward-bearing choice gets the check icon (not just chain-continuing choices) — the icon means "positive outcome", not narrowly "continues the chain".
3. The grey circle is reserved for a dilemma where *no* choice has any relation (no reward, no chain link) anywhere — not merely "this choice individually does nothing" — and renders as a solid filled disc rather than an outlined one.

## Non-goals (v1)

- No automatic reward computation — purely static, hand-maintained JSON, so it's trivial to swap for computed data later without touching the frontend.
- No search/filter/pagination on this page yet.
- No editing UI — updates to `dilemmas.json` are a manual edit + redeploy, same as any other static content in this repo.
- No validation of the JSON's shape at server startup — TypeScript's `resolveJsonModule` catches gross shape mismatches (missing/misspelled keys) against the `Dilemma[]` interface at build time via a type assertion (a checked assignment doesn't compile, since JSON string fields infer as plain `string`, not the narrower `'A' | 'B' | 'C'` literal union — see the plan for the exact assertion), which is sufficient for a hand-maintained file.

## Verification plan

- `tsc --noEmit` clean on both `client` and `server`.
- Real-browser check against `/dilemmas`:
  - Confirm all 4 rows render with the correct icons per the rules above (Part 1: A/B check, C x; Part 2: A x, B check; Part 3: A/B both check; Lost Among the Stars: A check, B x).
  - Confirm Part 3's reward column shows Fierce Guinan and Dr. Leonard McCoy side by side (not stacked), both with names, Drop Rate showing a single `"100%"`.
  - Confirm Lost Among the Stars shows all 11 pool crew icons side by side with no names, Drop Rate showing `"2%"`.
  - Confirm the "A Higher Duty" 3-row block has a visible bottom divider after Part 3, separating it from the next row.
  - Confirm the nav shows "Dilemmas" as the last top-level item, after "Collections", and it routes to `/dilemmas`.
