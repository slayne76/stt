# QPs Ready Chip + Shared StatusChip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the QPs page, bold a crew member's name and show a "Ready" chip when they're one round (≤25 QPs) from their next level, and extract the chip rendering into a new shared `StatusChip` component reused by both QPs and Collections.

**Architecture:** Two tasks. Task 1 creates the new generic `StatusChip` component and proves it's genuinely reusable by refactoring Collections' two existing inline chips (`Ready`, needs-work) onto it — a pure extraction, no visual change, independently verifiable against the existing Collections page. Task 2 is the actual new feature: `QPsTable` gains a per-row `isReady` check and renders the bolded-name + `StatusChip` treatment, consuming the component Task 1 built.

**Tech Stack:** Same as the existing client workspace — React 19, TypeScript (strict), MUI 6, no new dependencies.

## Global Constraints

- **"Ready" condition:** `getQPRoundsLeft(c) <= 1` — equivalent to points-needed ≤ 25, the same boundary the QPs page already uses to sort the "on hold" group to the bottom. No new getter is introduced; `getQPRoundsLeft` (already exported from `crew/getters.ts`) is reused directly.
- **New `StatusChip` component is generic** — props are `{ label: string; color: ChipProps['color'] }`, no domain-specific enum (no "ready"/"needs work" baked in), so future differently-labeled/colored chips reuse it unmodified.
- **New component lives at `client/src/components/StatusChip.tsx`** — first file in a new `client/src/components/` folder (this project didn't previously have a home for small, reusable, presentational UI shared across domains/pages).
- **Both of Collections' existing chip variants get migrated onto `StatusChip`**, not just the "Ready" one, to prove the extraction covers both.
- **No automated test framework** (project-wide, deliberate choice). Verification is `tsc`/`eslint` clean plus interactive `playwright` MCP browser checks against a real running dev server with live data.
- **Spec:** `docs/superpowers/specs/2026-08-08-qps-ready-chip-design.md`.

---

### Task 1: `StatusChip` component + Collections refactor

**Files:**
- Create: `client/src/components/StatusChip.tsx`
- Modify: `client/src/collections/CollectionCrewList.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 2): `StatusChip` — default export, props `{ label: string; color: ChipProps['color'] }`, from `client/src/components/StatusChip.tsx`.

- [ ] **Step 1: Confirm the current state of `CollectionCrewList.tsx` matches this plan's assumptions**

Run: `cat -n client/src/collections/CollectionCrewList.tsx`

Confirm it matches exactly:
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
            {isNeedsWork && <Chip label={`${c.max_rarity}/${c.max_rarity} Stars`} size="small" color="warning" />}
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

Also confirm `client/src/components/` does not yet exist: `ls client/src/components 2>&1` should report "No such file or directory". If either check differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Create `client/src/components/StatusChip.tsx`**

```tsx
import { Chip } from '@mui/material';
import type { ChipProps } from '@mui/material';

export interface StatusChipProps {
  label: string;
  color: ChipProps['color'];
}

function StatusChip({ label, color }: StatusChipProps) {
  return <Chip label={label} size="small" color={color} />;
}

export default StatusChip;
```

- [ ] **Step 3: Refactor `client/src/collections/CollectionCrewList.tsx` to use `StatusChip`**

Replace the whole file with:
```tsx
import { Box, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { OwnedItem } from '../types/item';
import { getCrewTier, getEquipmentSlotsRemaining } from '../crew/getters';
import StarRating from '../crew/StarRating';
import StatusChip from '../components/StatusChip';

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
            {isReady && <StatusChip label="Ready" color="success" />}
            {isNeedsWork && <StatusChip label={`${c.max_rarity}/${c.max_rarity} Stars`} color="warning" />}
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

Note the `Chip` import is gone from this file (replaced by `StatusChip`) — `Box` and `Typography` are still used and stay.

- [ ] **Step 4: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no new errors.

- [ ] **Step 5: Verify against a real running dev server**

Using the `playwright` MCP browser tools against a real running dev server with live data (check with the controller for the exact dev-server URL to use in this environment):

1. Navigate to `/collections`. `browser_snapshot`.
2. Expand a collection that has at least one fully-immortalized crew member and at least one crew member needing more stars (a collection with several qualifying crew is a good candidate — spot-check a couple until one has both).
3. Confirm a green "Ready" chip still renders next to at least one bolded crew name.
4. Confirm an orange/warning `N/N Stars` chip still renders next to at least one crew name needing more stars, with the correct `max_rarity` value.
5. This is a pure extraction — the rendering should look pixel-identical to before the refactor. Flag anything that looks different.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/StatusChip.tsx client/src/collections/CollectionCrewList.tsx
git commit -m "Extract StatusChip and migrate Collections' Ready/needs-work chips onto it"
```

---

### Task 2: QPsTable "Ready" treatment

**Files:**
- Modify: `client/src/crew/QPsTable.tsx`

**Interfaces:**
- Consumes: `StatusChip` (`components/StatusChip.tsx`, from Task 1); `getQPRoundsLeft` (already exported from `crew/getters.ts`, pre-existing).
- Produces: nothing new consumed elsewhere — this is the final UI-facing change.

- [ ] **Step 1: Confirm the current state of `QPsTable.tsx` matches this plan's assumptions**

Run: `cat -n client/src/crew/QPsTable.tsx`

Confirm it matches exactly:
```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CrewMember } from '../types/crew';
import { getQPLevel, getQPProgressDisplay, getQPPointsNeeded, getQPRoundsLeft, QP_MAX_LEVEL } from './getters';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';

export interface QPsTableProps {
  crew: CrewMember[];
}

function QPsTable({ crew }: QPsTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">QL</TableCell>
            <TableCell align="right">QPs</TableCell>
            <TableCell align="right">Points left</TableCell>
            <TableCell align="right">Rounds left</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={c.portrait} />
              </TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{getQPLevel(c)}/{QP_MAX_LEVEL}</TableCell>
              <TableCell align="right">{getQPProgressDisplay(c)}</TableCell>
              <TableCell align="right">-{getQPPointsNeeded(c)}</TableCell>
              <TableCell align="right">-{getQPRoundsLeft(c)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default QPsTable;
```

Also confirm `client/src/components/StatusChip.tsx` exists (from Task 1): `cat -n client/src/components/StatusChip.tsx`. If either check differs, stop and re-check the spec before proceeding.

- [ ] **Step 2: Add the "Ready" treatment to the Name cell**

Replace:
```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CrewMember } from '../types/crew';
import { getQPLevel, getQPProgressDisplay, getQPPointsNeeded, getQPRoundsLeft, QP_MAX_LEVEL } from './getters';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';

export interface QPsTableProps {
  crew: CrewMember[];
}

function QPsTable({ crew }: QPsTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">QL</TableCell>
            <TableCell align="right">QPs</TableCell>
            <TableCell align="right">Points left</TableCell>
            <TableCell align="right">Rounds left</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={c.portrait} />
              </TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{getQPLevel(c)}/{QP_MAX_LEVEL}</TableCell>
              <TableCell align="right">{getQPProgressDisplay(c)}</TableCell>
              <TableCell align="right">-{getQPPointsNeeded(c)}</TableCell>
              <TableCell align="right">-{getQPRoundsLeft(c)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default QPsTable;
```
with:
```tsx
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { CrewMember } from '../types/crew';
import { getQPLevel, getQPProgressDisplay, getQPPointsNeeded, getQPRoundsLeft, QP_MAX_LEVEL } from './getters';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';
import StatusChip from '../components/StatusChip';

export interface QPsTableProps {
  crew: CrewMember[];
}

function QPsTable({ crew }: QPsTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">QL</TableCell>
            <TableCell align="right">QPs</TableCell>
            <TableCell align="right">Points left</TableCell>
            <TableCell align="right">Rounds left</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => {
            const isReady = getQPRoundsLeft(c) <= 1;
            return (
              <TableRow key={c.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <Thumbnail asset={c.portrait} />
                </TableCell>
                <TableCell>
                  <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: isReady ? 'bold' : 'normal' }}>{c.name}</Typography>
                    {isReady && <StatusChip label="Ready" color="success" />}
                  </Box>
                </TableCell>
                <TableCell align="right">{getQPLevel(c)}/{QP_MAX_LEVEL}</TableCell>
                <TableCell align="right">{getQPProgressDisplay(c)}</TableCell>
                <TableCell align="right">-{getQPPointsNeeded(c)}</TableCell>
                <TableCell align="right">-{getQPRoundsLeft(c)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default QPsTable;
```

- [ ] **Step 3: Build and lint check**

Run: `npm run build -w client`
Expected: exits 0.

Run: `npm run lint -w client`
Expected: exits 0, no new errors.

- [ ] **Step 4: Verify against a real running dev server**

Using the `playwright` MCP browser tools against a real running dev server with live data (check with the controller for the exact dev-server URL to use in this environment):

1. Navigate to `/qps`. `browser_snapshot`.
2. Find a row where "Rounds left" reads `-1`. Confirm that row's name is bold and has a green "Ready" chip to its right.
3. Find a row where "Rounds left" reads `-2` or more negative. Confirm that row's name is NOT bold and has NO chip.
4. If every row happens to be `-1` (all "on hold") or none are, note this in the report rather than treating it as a pass — re-check with the real dataset which rows exist, since the assertion needs both a positive and a negative case to be meaningful.

- [ ] **Step 5: Commit**

```bash
git add client/src/crew/QPsTable.tsx
git commit -m "Bold ready crew names and show a Ready chip on the QPs page"
```
