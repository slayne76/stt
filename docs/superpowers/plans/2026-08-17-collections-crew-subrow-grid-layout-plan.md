# Collections crew subrow grid layout + bold labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Collections page's per-collection crew subrow flex layout with a fixed-width CSS Grid layout so fields align in columns across rows, and bold every field's label (`Level:`, `Items:`, `Total Collections:`, `Other Collections:`).

**Architecture:** Full rewrite of the render body of one file, `client/src/collections/CollectionCrewList.tsx` — `display: 'flex'` becomes `display: 'grid'` with a fixed `gridTemplateColumns` (same fixed widths on every row produce cross-row alignment since each row is its own independent grid), and a new local `Field` helper renders each bold-label/value pair. No prop signature change, no other file touched.

**Tech Stack:** React 19 + TypeScript strict, MUI (`Box`, `Typography`), no test framework — verification via strict typecheck plus a real-browser screenshot check (this exact design was already prototyped and approved via real screenshots during brainstorming — this task reapplies the identical, already-validated code).

## Global Constraints

- `GRID_TEMPLATE_COLUMNS = '110px 220px 140px 120px 100px 200px 1fr'` — these exact widths, in this exact order (Star, Name, chip, Level, Items, Total Collections, Other Collections). Do not adjust them; they were tuned against real data and approved by the user.
- All four field labels (`Level:`, `Items:`, `Total Collections:`, `Other Collections:`) are bold; their values stay normal weight — via a shared `Field` helper component, not four separate inline blocks.
- Only `Other Collections:` gets `wrap={true}` on `Field` (its value is the one genuinely unbounded-length field) — every other field stays `whiteSpace: 'nowrap'` (the `wrap` prop's default).
- The status chip (`Ready` / `N/N Stars` / neither) becomes its own grid cell (`<Box>`, empty when neither renders) so its presence/absence never shifts later columns.
- No change to `CollectionCrewListProps`, no change to `CollectionsTable.tsx` or `CollectionsPage.tsx`, no change to any data-fetching/filtering logic (`getCrewCollections`, `getCrewTier`, `getEquipmentSlotsRemaining` calls stay exactly as they are).
- No column headers.

---

### Task 1: Rewrite CollectionCrewList.tsx with a grid layout and bold field labels

**Files:**
- Modify: `client/src/collections/CollectionCrewList.tsx`

**Interfaces:**
- Consumes: `getCrewTier`, `getEquipmentSlotsRemaining` (`client/src/crew/getters.ts`), `getCrewCollections` (`client/src/collections/getters.ts`), `StarRating` (`client/src/crew/StarRating.tsx`), `StatusChip` (`client/src/components/StatusChip.tsx`), `STRIPE_COLOR` (`client/src/theme.ts`) — all pre-existing, unchanged imports.
- Produces: no new exports. `CollectionCrewListProps` is unchanged (`crew`, `items`, `allCollections`, `currentCollectionId`) — this task only changes the component's internal rendering, not its public interface, so `CollectionsTable.tsx`'s call site needs no change.

- [ ] **Step 1: Replace the file's full contents**

Read the current file first (`client/src/collections/CollectionCrewList.tsx`) to confirm you're editing the live version. Replace its entire contents with:

```tsx
import { Box, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import { getCrewCollections } from './getters';
import StarRating from '../crew/StarRating';
import StatusChip from '../components/StatusChip';
import { STRIPE_COLOR } from '../theme';

export interface CollectionCrewListProps {
  crew: CrewMember[];
  items: OwnedItem[];
  allCollections: Collection[];
  currentCollectionId: number;
}

// Fixed pixel widths (not fr/auto) so every row's independent grid resolves
// to the same column positions, producing table-like vertical alignment
// without a shared grid container or visible header row.
const GRID_TEMPLATE_COLUMNS = '110px 220px 140px 120px 100px 200px 1fr';

function Field({ label, value, wrap = false }: { label: string; value: React.ReactNode; wrap?: boolean }) {
  return (
    <Typography color="text.secondary" sx={wrap ? undefined : { whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ fontWeight: 'bold' }}>
        {label}
      </Box>{' '}
      {value}
    </Typography>
  );
}

function CollectionCrewList({ crew, items, allCollections, currentCollectionId }: CollectionCrewListProps) {
  return (
    <Box sx={{ py: 1 }}>
      {crew.map((c, i) => {
        const tier = getCrewTier(c, items);
        const isReady = tier === 'ready';
        const isNeedsWork = tier === 'needsWork';
        const crewCollections = getCrewCollections(c, allCollections);
        const otherCollections = crewCollections.filter((col) => col.id !== currentCollectionId);
        return (
          <Box
            key={c.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
              alignItems: 'center',
              columnGap: 1,
              py: 0.5,
              // Cancels parent TableCell's 16px padding so each stripe reaches the cell edges
              px: 2,
              mx: -2,
              bgcolor: i % 2 === 1 ? STRIPE_COLOR : 'transparent',
            }}
          >
            <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
            <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal' }}>{c.name}</Typography>
            <Box>
              {isReady && <StatusChip label="Ready" color="success" />}
              {isNeedsWork && <StatusChip label={`${c.max_rarity}/${c.max_rarity} Stars`} color="warning" />}
            </Box>
            <Field label="Level:" value={c.level} />
            <Field label="Items:" value={getEquipmentSlotsRemaining(c)} />
            <Field label="Total Collections:" value={crewCollections.length} />
            <Field
              label="Other Collections:"
              value={otherCollections.map((col) => col.name).join(', ')}
              wrap
            />
          </Box>
        );
      })}
    </Box>
  );
}

export default CollectionCrewList;
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd client && npx eslint src/collections/CollectionCrewList.tsx`
Expected: no errors.

- [ ] **Step 4: Real-browser check**

Start the dev server if one isn't already running in this worktree (`npm run dev` from the repo root; check `ss -ltnp | grep node` for an already-listening vite port first — do not start a second instance). Using `playwright` (per this repo's `CLAUDE.md` — prefer the `playwright`/`chrome-devtools` MCP tools first, fall back to the raw `playwright` npm library):

1. Navigate to `/collections`.
2. Screenshot the top of the page. Confirm: `Level:`, `Items:`, `Total Collections:`, `Other Collections:` labels are bold; values are normal weight; each field's text starts at the same horizontal position across every visible crew row (e.g. every `Level:` label's left edge lines up vertically, regardless of which collection's crew list it's in).
3. Confirm no field wraps mid-label/value onto two lines except `Other Collections:` — spot-check at least one row with a 3-digit `Level:` value (100) and at least one row with a multi-digit negative `Items:` value, to confirm the column widths accommodate them on one line.
4. Confirm a crew name that's long enough to wrap (e.g. "Formal Dress Wesley Crusher" or similar) wraps within its own Name column without disturbing the alignment of the Level/Items/Total Collections/Other Collections columns in that same row or any other row.
5. Confirm the zero-other-collections case renders sensibly: find a crew with `Total Collections: 1` and confirm `Other Collections:` (bold label, nothing after it) doesn't look broken.

- [ ] **Step 5: Commit**

```bash
git add client/src/collections/CollectionCrewList.tsx
git commit -m "Grid-align Collections crew subrow fields and bold field labels"
```

## Self-Review Notes

- Spec coverage: the spec's entire Design section is one file's full-contents replacement, covered by this task's single step. The spec's non-goals (no headers, no change to `CollectionsTable.tsx`/`CollectionsPage.tsx`, no data-logic change, no responsive/mobile handling) are respected — this plan touches no other file and changes no prop signature or getter call.
- Single task, matching the spec's own single-file scope — no cross-file coordination needed since `CollectionCrewListProps` is unchanged, so `CollectionsTable.tsx`'s existing call site keeps compiling with zero changes.
