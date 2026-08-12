# Hide Buyback-State Crew from Duplicate Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 4 Stars Duplicates and 5 Stars Duplicates pages should stop showing crew the user has already trashed in-game (in a temporary, recoverable "buyback" state) — `filterFrozenDuplicates` needs to exclude any crew with `in_buy_back_state: true`.

**Architecture:** Add one required boolean field to the `CrewMember` type (the raw game data already has it on every crew record; the app's type just never declared it), then add one `&&` condition to the single existing filter function both duplicate pages already route through. No new files, no new components, no other page affected.

**Tech Stack:** React + TypeScript client. No automated test framework in this project (deliberate, established choice) — verification is a data-driven check against the real, current `server/data/player-cache.json` (not the repo's static, stale `example-data.json`), plus real-browser observation.

## Global Constraints

- `in_buy_back_state` must be typed as a required `boolean` on `CrewMember`, not optional — confirmed present as a real boolean (never missing/undefined) on all 608 crew records in the live data.
- No change to any file other than `client/src/types/crew.ts` and `client/src/crew/filters.ts`. Every other page (Collections, QPs, Overview counts, the main crew-tier pages) must keep counting buyback-state crew exactly as before — this is scoped to the 2 duplicate pages only.
- Verification must use `server/data/player-cache.json`, not `example-data.json` — the latter has zero `in_buy_back_state: true` crew and would make this change look like a no-op even if broken.

---

### Task 1: Add `in_buy_back_state` to `CrewMember` and exclude it in `filterFrozenDuplicates`

**Files:**
- Modify: `client/src/types/crew.ts`
- Modify: `client/src/crew/filters.ts`

**Interfaces:**
- Consumes: nothing new from elsewhere in the codebase.
- Produces: `CrewMember` gains `in_buy_back_state: boolean` (required). `filterFrozenDuplicates(crew: CrewMember[], frozenArchetypeIds: Set<number>, maxRarity: number): CrewMember[]` keeps its exact existing signature — only its filter predicate changes, so `FrozenDuplicatesPage.tsx` (and the two page components that render it) need no changes at all.

This is a single task because both edits are needed together for the code to express the intended behavior, and each file's edit is one line.

- [ ] **Step 1: Confirm current call sites of the type and filter being changed**

Run: `grep -rn "filterFrozenDuplicates\|CrewMember" client/src --include="*.tsx" --include="*.ts" | grep -v "\.test\."`

Expected: `filterFrozenDuplicates` has exactly one call site, `client/src/pages/FrozenDuplicatesPage.tsx`. `CrewMember` is used widely (it's the app's core crew type) — this is expected and fine, since adding a new *required* field only breaks callers that *construct* a literal `CrewMember` object by hand (not ones that just read fields from one already typed as `CrewMember`). If you find any file that constructs a `CrewMember` object literal (not just reads one), STOP and report — the plan's assumption that this is a safe, non-breaking type addition would need re-checking.

- [ ] **Step 2: Edit `client/src/types/crew.ts`**

Add `in_buy_back_state: boolean;` as the last field in the `CrewMember` interface:

```ts
import type { DatacoreAsset } from './asset';

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

- [ ] **Step 3: Edit `client/src/crew/filters.ts`**

Change `filterFrozenDuplicates` from:

```ts
export function filterFrozenDuplicates(crew: CrewMember[], frozenArchetypeIds: Set<number>, maxRarity: number): CrewMember[] {
  return crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && c.max_rarity === maxRarity);
}
```

to:

```ts
export function filterFrozenDuplicates(crew: CrewMember[], frozenArchetypeIds: Set<number>, maxRarity: number): CrewMember[] {
  return crew.filter((c) => frozenArchetypeIds.has(c.archetype_id) && c.max_rarity === maxRarity && !c.in_buy_back_state);
}
```

No other function in this file changes.

- [ ] **Step 4: Build and lint**

Run: `npm run build -w client`
Expected: `tsc -b && vite build` completes with `✓ built in ...`, no TypeScript errors. This is the check that adding a required field to `CrewMember` didn't break any code that constructs a `CrewMember` object literal elsewhere (Step 1 already confirmed there shouldn't be one, but the build is the authoritative proof).

Run: `npm run lint -w client`
Expected: `0 errors` (the same 4 pre-existing `react-refresh/only-export-components` warnings in unrelated files are fine).

- [ ] **Step 5: Data-driven verification against the real, current data**

Do NOT use `example-data.json` for this check — it's stale for this feature (zero `in_buy_back_state: true` crew in it). Use `server/data/player-cache.json` instead (copy it into this worktree from the repo root's `server/data/player-cache.json` if this worktree doesn't already have it — it's gitignored, same as `example-data.json`).

Run this script (adjust the path to wherever the seeded file lives in your worktree):

```bash
node -e '
const data = require("./server/data/player-cache.json");
const crew = data.player.character.crew;
const storedImmortals = data.player.character.stored_immortals || [];
const frozenIds = new Set(storedImmortals.map(s => s.id));

function dup(maxRarity) {
  return crew.filter(c => frozenIds.has(c.archetype_id) && c.max_rarity === maxRarity && !c.in_buy_back_state);
}

const four = dup(4).map(c => c.name).sort();
const five = dup(5).map(c => c.name).sort();
console.log("4-star duplicates (post-filter):", four);
console.log("5-star duplicates (post-filter):", five);
'
```

Expected output: `4-star duplicates (post-filter): [ 'Anxious Kirk', 'Captain Janeway', 'Indignant Seven' ]` (exactly these 3, alphabetically sorted by the script) and `5-star duplicates (post-filter): []`. Report the exact raw output — not a summary — since this is the concrete, independently-checkable claim this task's correctness rests on.

- [ ] **Step 6: Real-browser verification**

Seed data if not already present in this worktree: `cp example-data.json example-data.json` is not relevant here — instead ensure `server/data/player-cache.json` is seeded (copy from the repo root's own `server/data/player-cache.json`, not `example-data.json`, since this feature's verification specifically depends on real buyback-state crew that only exist in the fresher file).

Start a dev server (check port 5173 isn't already in use by something else first — if it is, don't kill it, let Vite pick an alternate port; see this project's `CLAUDE.md` for the sanctioned Playwright verification approach). Navigate to `/4-stars-duplicates` and `/5-stars-duplicates`.

Using the `playwright`/`chrome-devtools` MCP tools (or the `playwright` library directly if those aren't loaded), read the actual rendered crew names from the DOM on `/4-stars-duplicates` (per-cell/per-row reads, not concatenated whole-row text — this project has had real data-corruption incidents from that specific mistake before). Expected: exactly 3 rows, names `Anxious Kirk`, `Captain Janeway`, `Indignant Seven` (any order — the page's own sort applies), and the page's count heading reflects `3`. On `/5-stars-duplicates`, expected: the page's empty state ("No duplicate crew at this rarity.") since there are zero 5-star duplicates in this data regardless of the fix.

Confirm no console errors. Stop any dev server you started yourself, targeting its exact PID (never a name/pattern-based kill) — same process-safety rule as always on this project.

- [ ] **Step 7: Commit**

```bash
git add client/src/types/crew.ts client/src/crew/filters.ts
git commit -m "Hide buyback-state (trashed) crew from the duplicate crew pages"
```
