# Dilemmas table: "(part x/y)" chain subtitle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a `(part x/y)` subtitle under a dilemma's name in the Dilemmas table whenever its chain has more than one member, and add the "The Beginning of the End of the World" / "The Voice of the Prophets" chain that motivated this (two dilemmas sharing a `chainName` but with unrelated display names).

**Architecture:** A new pure getter (`getChainSizeByName`) derives a `chainName → count` map from the existing `Dilemma[]` array — no schema change. `DilemmasPage` computes it once and passes it to `DilemmasTable`, which renders the subtitle conditionally in the Name cell. One data-only addition to `dilemmas.json` for the new chain.

**Tech Stack:** React 19 + TypeScript (strict) + MUI, Vite dev server. No test framework — verification via `tsc --noEmit` and a real-browser check with the `playwright` npm library.

**Design reference:** `docs/superpowers/specs/2026-08-18-dilemmas-chain-subtitle-design.md`.

## Global Constraints

- Subtitle text is exactly `(part {partNumber}/{chainSize})` — e.g. `(part 1/2)`.
- Subtitle renders **only** when `chainSize > 1` for that dilemma's `chainName`. A chain of 1 (every existing standalone dilemma) shows nothing extra — no visual change for them.
- `chainSize` is computed purely from `chainName`/`partNumber`, already on every `Dilemma` — no new field on the data model.
- No change to the choice-icon rule, reward/drop-rate rendering, sort order, or the chain-boundary divider — all already work correctly off `chainName`/`partNumber` regardless of the display-name pattern.
- New chain's `chainName` is `"The Beginning of the End of the World"` on **both** new dilemmas, even though the second one's own `name` is `"The Voice of the Prophets"` — this is the exact case the subtitle exists to surface.

---

### Task 1: Add the chain-size getter, subtitle rendering, and the new chain's seed data

**Files:**
- Modify: `client/src/dilemmas/getters.ts`
- Modify: `client/src/dilemmas/DilemmasTable.tsx`
- Modify: `client/src/pages/DilemmasPage.tsx`
- Modify: `server/src/data/dilemmas.json`

**Interfaces:**
- Produces (from `getters.ts`): `getChainSizeByName(dilemmas: Dilemma[]): Map<string, number>` — exported, same file/module as the existing `sortedDilemmas`/`buildCatalogEntryMap`.
- Consumes (in `DilemmasPage.tsx`): the new export above, plus the existing `sortedDilemmas` result already computed there.
- Consumes (in `DilemmasTable.tsx`): a new `chainSizeByName: Map<string, number>` prop.

- [ ] **Step 1: Add `getChainSizeByName` to `getters.ts`**

Current code (`client/src/dilemmas/getters.ts`, end of file):

```ts
export function buildCatalogEntryMap(catalog: CatalogEntry[]): Map<number, CatalogEntry> {
  return new Map(catalog.map((c) => [c.archetype_id, c]));
}
```

Add immediately after it (keep `buildCatalogEntryMap` unchanged):

```ts
// How many dilemmas share a given chainName — drives the "(part x/y)"
// subtitle in DilemmasTable.tsx, shown only when this is > 1. Purely
// derived from chainName/partNumber already on every Dilemma; no schema
// change. Two dilemmas can share a chainName despite having completely
// unrelated `name` values (see "The Beginning of the End of the World" /
// "The Voice of the Prophets") — the subtitle is what makes that
// relationship visible in the table.
export function getChainSizeByName(dilemmas: Dilemma[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const d of dilemmas) {
    sizes.set(d.chainName, (sizes.get(d.chainName) ?? 0) + 1);
  }
  return sizes;
}
```

- [ ] **Step 2: Add the `chainSizeByName` prop and subtitle rendering to `DilemmasTable.tsx`**

Current code (`client/src/dilemmas/DilemmasTable.tsx`, lines 20-25):

```ts
export interface DilemmasTableProps {
  // Must already be sorted by chainName then partNumber (see getters.ts's
  // sortedDilemmas) — this component only reads adjacency, it doesn't sort.
  dilemmas: Dilemma[];
  catalogMap: Map<number, CatalogEntry>;
}
```

Replace with:

```ts
export interface DilemmasTableProps {
  // Must already be sorted by chainName then partNumber (see getters.ts's
  // sortedDilemmas) — this component only reads adjacency, it doesn't sort.
  dilemmas: Dilemma[];
  catalogMap: Map<number, CatalogEntry>;
  // chainName -> how many dilemmas share it (see getters.ts's
  // getChainSizeByName) — drives the "(part x/y)" subtitle, shown only
  // when a dilemma's own chain size is > 1.
  chainSizeByName: Map<string, number>;
}
```

Current code (lines 114-115):

```tsx
function DilemmasTable({ dilemmas, catalogMap }: DilemmasTableProps) {
  return (
```

Replace with:

```tsx
function DilemmasTable({ dilemmas, catalogMap, chainSizeByName }: DilemmasTableProps) {
  return (
```

Current code (lines 128-137):

```tsx
          {dilemmas.map((dilemma, index) => {
            const isChainEnd =
              index === dilemmas.length - 1 || dilemmas[index + 1].chainName !== dilemma.chainName;
            return (
              <TableRow
                key={dilemma.id}
                sx={isChainEnd ? { '& td': { borderBottom: `2px solid ${BLOCK_BOUNDARY_COLOR}` } } : undefined}
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{dilemma.name}</TableCell>
```

Replace with:

```tsx
          {dilemmas.map((dilemma, index) => {
            const isChainEnd =
              index === dilemmas.length - 1 || dilemmas[index + 1].chainName !== dilemma.chainName;
            const chainSize = chainSizeByName.get(dilemma.chainName) ?? 1;
            return (
              <TableRow
                key={dilemma.id}
                sx={isChainEnd ? { '& td': { borderBottom: `2px solid ${BLOCK_BOUNDARY_COLOR}` } } : undefined}
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {dilemma.name}
                  {chainSize > 1 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      (part {dilemma.partNumber}/{chainSize})
                    </Typography>
                  )}
                </TableCell>
```

- [ ] **Step 3: Compute and pass `chainSizeByName` in `DilemmasPage.tsx`**

Current code (`client/src/pages/DilemmasPage.tsx`, line 3):

```ts
import { sortedDilemmas, buildCatalogEntryMap } from '../dilemmas/getters';
```

Replace with:

```ts
import { sortedDilemmas, buildCatalogEntryMap, getChainSizeByName } from '../dilemmas/getters';
```

Current code (lines 13-14):

```ts
  const dilemmas = data ? sortedDilemmas(data.dilemmas) : [];
  const catalogMap = buildCatalogEntryMap(catalog ?? []);
```

Replace with:

```ts
  const dilemmas = data ? sortedDilemmas(data.dilemmas) : [];
  const catalogMap = buildCatalogEntryMap(catalog ?? []);
  const chainSizeByName = getChainSizeByName(dilemmas);
```

Current code (line 26):

```tsx
      <DilemmasTable dilemmas={dilemmas} catalogMap={catalogMap} />
```

Replace with:

```tsx
      <DilemmasTable dilemmas={dilemmas} catalogMap={catalogMap} chainSizeByName={chainSizeByName} />
```

- [ ] **Step 4: Add the new chain to `server/src/data/dilemmas.json`**

Current code (end of the `dilemmas` array, after the `interference-part-2` entry):

```json
    {
      "id": "interference-part-2",
      "name": "Interference, Part 2",
      "chainName": "Interference",
      "partNumber": 2,
      "choices": [
        { "letter": "A", "description": "Lure the substance out without harming it.", "rewards": [{ "crewArchetypeId": 6970, "dropRatePercent": 100, "showName": true }] },
        { "letter": "B", "description": "Dissolve the substance before it reaches the impulse engines." }
      ]
    }
  ]
}
```

Replace with:

```json
    {
      "id": "interference-part-2",
      "name": "Interference, Part 2",
      "chainName": "Interference",
      "partNumber": 2,
      "choices": [
        { "letter": "A", "description": "Lure the substance out without harming it.", "rewards": [{ "crewArchetypeId": 6970, "dropRatePercent": 100, "showName": true }] },
        { "letter": "B", "description": "Dissolve the substance before it reaches the impulse engines." }
      ]
    },
    {
      "id": "the-beginning-of-the-end-of-the-world",
      "name": "The Beginning of the End of the World",
      "chainName": "The Beginning of the End of the World",
      "partNumber": 1,
      "choices": [
        { "letter": "A", "description": "Debate the vedek.", "leadsToDilemmaId": "the-voice-of-the-prophets" },
        { "letter": "B", "description": "Reassure the crowd that they are safe." },
        { "letter": "C", "description": "Allow the vedek to share his beliefs." }
      ]
    },
    {
      "id": "the-voice-of-the-prophets",
      "name": "The Voice of the Prophets",
      "chainName": "The Beginning of the End of the World",
      "partNumber": 2,
      "choices": [
        { "letter": "A", "description": "Ask the vedek to hand over the Orb." },
        { "letter": "B", "description": "Stun him before he can open the Orb." },
        { "letter": "C", "description": "Convince the vedek that he does not need the Orb's visions.", "rewards": [{ "crewArchetypeId": 6960, "dropRatePercent": 100, "showName": true }] }
      ]
    }
  ]
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p client`
Expected: PASS, no errors.

Run: `python3 -c "import json; json.load(open('server/src/data/dilemmas.json')); print('valid JSON')"`
Expected: `valid JSON`.

- [ ] **Step 6: Real-browser check**

Using the `playwright` npm library (per this repo's CLAUDE.md — headless
`chromium.launch()`), against the running dev app's `/dilemmas` route,
with real player/catalog data loaded:

1. Confirm "The Beginning of the End of the World" shows a `(part 1/2)`
   subtitle under its name, and "The Voice of the Prophets" shows
   `(part 2/2)`.
2. Confirm every existing dilemma whose chain has exactly one member
   (e.g. "Lost Among the Stars") shows **no** subtitle at all — no visual
   change for them.
3. Confirm the two new rows sort together (alphabetically under "T",
   partNumber 1 before 2) with the chain-boundary divider appearing after
   the second row, separating it from whatever row follows.
4. Confirm choice icons on the new rows: "The Beginning of the End of the
   World" — A check (leads onward), B/C x. "The Voice of the Prophets" —
   C check (has a reward), A/B x.
5. Confirm "The Voice of the Prophets"'s Reward column shows "The Clown"
   with portrait + name, Drop Rate `100%`.

- [ ] **Step 7: Commit**

```bash
git add client/src/dilemmas/getters.ts client/src/dilemmas/DilemmasTable.tsx client/src/pages/DilemmasPage.tsx server/src/data/dilemmas.json
git commit -m "Add (part x/y) chain subtitle to Dilemmas table; add The Beginning of the End of the World chain"
```
