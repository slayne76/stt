# Crew/Ship Image Column (Phase 1, Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 40px thumbnail image column, second from the left, to every crew page and every ship page — crew portraits and ship preview art, hotlinked directly from `assets.datacore.app`.

**Architecture:** Both crew and ship objects in the real player payload already carry the exact asset path under a `{file}` object (`crew.portrait.file`, `ship.icon.file`) — no name-based URL prediction is needed. One small, asset-type-agnostic function turns any `{file}` object into a full image URL; one shared `Thumbnail` component renders it (or a placeholder) and is reused by both `CrewTable` and `ShipsTable`, the two components every crew/ship page already renders through.

**Tech Stack:** React 19 + TypeScript + MUI 6, Vite 8 client workspace. No backend changes in this phase — images load directly from `https://assets.datacore.app` in the browser.

## Global Constraints

- Asset host constant: `ASSET_BASE_URL = 'https://assets.datacore.app'` — the exact, literal value; lives in its own file so Phase 2 can repoint it later.
- Thumbnail size: 40×40px square (not circular, not a larger size) — `sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }}`.
- New "Image" column goes immediately after `#`, before every other existing column, on both `CrewTable` and `ShipsTable`.
- Crew images use `crew.portrait` (not `full_body`, not `icon`). Ship images use `ship.icon` (not `schematic_icon`).
- Placeholder (missing `{file}` data, or `onError` on load) is a plain grey `Box`: `sx={{ width: 40, height: 40, bgcolor: 'action.hover', borderRadius: 1 }}` — same box for both failure cases, no retry logic.
- `alt` text is the crew/ship's `name`, passed in by the caller — `Thumbnail` itself has no knowledge of what kind of entity it's rendering.
- This project has no automated test framework (deliberate, repeatedly reaffirmed project-wide choice — see `docs/PROJECT_STATE.md`). Verification is TypeScript strict compilation (`npm run build --workspace=client`), ESLint (`npm run lint --workspace=client`), a throwaway data-driven verify script run via `npx tsx` and deleted before committing, and manual/browser-based checks against the real dev server.
- `example-data.json` (gitignored, at repo root `/home/slayne76/stt/example-data.json`) is the ground-truth data for verification — never commit it, never commit any script output derived from copying its contents into source.

---

### Task 1: Data model + asset URL utility

**Files:**
- Create: `client/src/types/asset.ts`
- Modify: `client/src/types/crew.ts`
- Modify: `client/src/types/ship.ts`
- Create: `client/src/assets/config.ts`
- Create: `client/src/assets/getAssetUrl.ts`
- Verify (throwaway, deleted before commit): `client/src/assets/__verify.ts`

**Interfaces:**
- Produces: `DatacoreAsset { file: string }` (exported from `client/src/types/asset.ts`); `CrewMember.portrait?: DatacoreAsset`; `Ship.icon?: DatacoreAsset`; `ASSET_BASE_URL: string` (exported from `client/src/assets/config.ts`); `getAssetUrl(asset: DatacoreAsset | undefined): string | undefined` (exported from `client/src/assets/getAssetUrl.ts`).

- [ ] **Step 1: Create the shared asset type**

Create `client/src/types/asset.ts`:

```ts
export interface DatacoreAsset {
  file: string; // e.g. "/crew_portraits/cm_pike_amand_rauth_sm"
}
```

- [ ] **Step 2: Extend `CrewMember` with an optional `portrait` field**

In `client/src/types/crew.ts`, add the import and field so the file reads exactly:

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
}
```

- [ ] **Step 3: Extend `Ship` with an optional `icon` field**

In `client/src/types/ship.ts`, add the import and field so the file reads exactly:

```ts
import type { DatacoreAsset } from './asset';

export interface Ship {
  id: number;
  symbol: string;
  name: string;
  rarity: number;
  level: number;
  max_level: number;
  schematic_id: number;
  schematic_gain_cost_next_level: number;
  icon?: DatacoreAsset;
}
```

- [ ] **Step 4: Create the asset host constant**

Create `client/src/assets/config.ts`:

```ts
export const ASSET_BASE_URL = 'https://assets.datacore.app';
```

- [ ] **Step 5: Create the URL-building utility**

Create `client/src/assets/getAssetUrl.ts`:

```ts
import { ASSET_BASE_URL } from './config';
import type { DatacoreAsset } from '../types/asset';

export function getAssetUrl(asset: DatacoreAsset | undefined): string | undefined {
  if (!asset?.file) return undefined;
  const path = asset.file.replace(/^\//, '').replace(/\//g, '_');
  return `${ASSET_BASE_URL}/${path}.png`;
}
```

- [ ] **Step 6: Write the throwaway verify script**

Create `client/src/assets/__verify.ts`:

```ts
import { readFileSync } from 'node:fs';
import { getAssetUrl } from './getAssetUrl';
import type { CrewMember } from '../types/crew';
import type { Ship } from '../types/ship';

const raw = readFileSync('../../example-data.json', 'utf-8');
const data = JSON.parse(raw) as {
  player: { character: { crew: CrewMember[]; ships: Ship[] } };
};

const crew = data.player.character.crew;
const ships = data.player.character.ships;

function assertEqual(label: string, actual: string | undefined, expected: string) {
  if (actual !== expected) {
    throw new Error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${label}: ${actual}`);
}

const amandRauthPike = crew.find((c) => c.name === 'Amand Rauth Pike');
assertEqual(
  'Amand Rauth Pike portrait',
  getAssetUrl(amandRauthPike?.portrait),
  'https://assets.datacore.app/crew_portraits_cm_pike_amand_rauth_sm.png'
);

const boldBoimler = crew.find((c) => c.name === 'Bold Boimler');
assertEqual(
  'Bold Boimler portrait',
  getAssetUrl(boldBoimler?.portrait),
  'https://assets.datacore.app/crew_portraits_cm_boimler_bold_sm.png'
);

const arcticOne = ships.find((s) => s.name === 'Arctic One');
assertEqual(
  'Arctic One icon',
  getAssetUrl(arcticOne?.icon),
  'https://assets.datacore.app/ship_previews_fed_arctic_one.png'
);

const altCerritos = ships.find((s) => s.name === 'Alternate Probability Cerritos');
assertEqual(
  'Alternate Probability Cerritos icon',
  getAssetUrl(altCerritos?.icon),
  'https://assets.datacore.app/ship_previews_alternate_probabilitly_cerritos.png'
);

const missingUrlCount = crew.filter((c) => getAssetUrl(c.portrait) === undefined).length;
console.log(`${missingUrlCount} of ${crew.length} crew have no resolvable portrait URL`);

const sampleUrls = crew.slice(0, 5).map((c) => getAssetUrl(c.portrait));
console.log('Sample crew URLs:', sampleUrls);

console.log('All assertions passed.');
```

- [ ] **Step 7: Run the verify script**

Run from `client/`: `npx tsx src/assets/__verify.ts`

Expected: four `PASS` lines matching the exact URLs above, a missing-portrait count printed with no thrown error, five sample URLs printed (each starting with `https://assets.datacore.app/crew_portraits_`), and a final `All assertions passed.` line. If any `assertEqual` throws, stop and re-check the crew/ship name spelling or the payload's `portrait`/`icon` field shape against `example-data.json` directly before touching `getAssetUrl` — the four expected URLs above were independently verified against the real payload during design and are known-correct.

- [ ] **Step 8: Type-check and build**

Run: `npm run build --workspace=client`
Expected: exits 0, no TypeScript errors (this exercises `tsc -b`, which will catch any mismatch between the new `portrait?`/`icon?` fields and their usage).

- [ ] **Step 9: Delete the throwaway verify script**

```bash
rm client/src/assets/__verify.ts
```

- [ ] **Step 10: Commit**

```bash
git add client/src/types/asset.ts client/src/types/crew.ts client/src/types/ship.ts client/src/assets/config.ts client/src/assets/getAssetUrl.ts
git commit -m "Add DatacoreAsset type and getAssetUrl utility for crew/ship images"
```

---

### Task 2: `Thumbnail` component + crew page wiring

**Files:**
- Create: `client/src/assets/Thumbnail.tsx`
- Modify: `client/src/crew/CrewTable.tsx`

**Interfaces:**
- Consumes: `DatacoreAsset` (from `client/src/types/asset.ts`, Task 1), `getAssetUrl` (from `client/src/assets/getAssetUrl.ts`, Task 1), `CrewMember.portrait` (from `client/src/types/crew.ts`, Task 1).
- Produces: `Thumbnail` — default export from `client/src/assets/Thumbnail.tsx`, props `ThumbnailProps { asset: DatacoreAsset | undefined; alt: string }`. Task 3 imports this unchanged.

- [ ] **Step 1: Create the `Thumbnail` component**

Create `client/src/assets/Thumbnail.tsx`:

```tsx
import { useState } from 'react';
import { Box } from '@mui/material';
import { getAssetUrl } from './getAssetUrl';
import type { DatacoreAsset } from '../types/asset';

export interface ThumbnailProps {
  asset: DatacoreAsset | undefined;
  alt: string;
}

function Thumbnail({ asset, alt }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const url = getAssetUrl(asset);

  if (!url || failed) {
    return <Box sx={{ width: 40, height: 40, bgcolor: 'action.hover', borderRadius: 1 }} />;
  }

  return (
    <Box
      component="img"
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }}
    />
  );
}

export default Thumbnail;
```

This matches this codebase's existing component convention (see `client/src/crew/StarRating.tsx`): a named, exported `*Props` interface, a plain function component, default export.

- [ ] **Step 2: Wire `Thumbnail` into `CrewTable`**

Modify `client/src/crew/CrewTable.tsx` so the full file reads exactly:

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import { getEquipmentSlotsRemaining } from './getters';
import { getCollectionCount } from '../collections/getters';
import StarRating from './StarRating';
import Thumbnail from '../assets/Thumbnail';

export interface CrewTableProps {
  crew: CrewMember[];
  collections: Collection[];
}

function CrewTable({ crew, collections }: CrewTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Stars</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Items to equip</TableCell>
            <TableCell align="right">Collections</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {crew.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={c.portrait} alt={c.name} />
              </TableCell>
              <TableCell>
                <StarRating rarity={c.rarity} maxRarity={c.max_rarity} />
              </TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell align="right">{c.level}</TableCell>
              <TableCell align="right">{getEquipmentSlotsRemaining(c)}</TableCell>
              <TableCell align="right">{getCollectionCount(c, collections)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default CrewTable;
```

- [ ] **Step 3: Type-check and lint**

Run: `npm run build --workspace=client && npm run lint --workspace=client`
Expected: both exit 0.

- [ ] **Step 4: Manual browser verification**

Start the app (`npm run dev` from the repo root starts both server and client). Since no real `STT_SESSION_COOKIE` is required for this check if `server/data/player-cache.json` already holds cached data from prior feature work — if the crew pages show real rows, proceed; if they show the auth-failure `Alert` instead, this step cannot be completed in this environment and should be noted as such rather than skipped silently.

Navigate to `/3-4-stars-crew` (or any populated crew page). Confirm:
- A new "Image" column header appears between `#` and "Stars".
- Each row shows either a 40×40 crew portrait image or the grey placeholder box — no broken-image icons, no layout shift between rows, no console errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/assets/Thumbnail.tsx client/src/crew/CrewTable.tsx
git commit -m "Add Thumbnail component and crew portrait column to CrewTable"
```

---

### Task 3: Ship page wiring

**Files:**
- Modify: `client/src/ships/ShipsTable.tsx`

**Interfaces:**
- Consumes: `Thumbnail`/`ThumbnailProps` (from `client/src/assets/Thumbnail.tsx`, Task 2, unchanged), `Ship.icon` (from `client/src/types/ship.ts`, Task 1).

- [ ] **Step 1: Wire `Thumbnail` into `ShipsTable`**

Modify `client/src/ships/ShipsTable.tsx` so the full file reads exactly:

```tsx
import { Box, LinearProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { Ship } from '../types/ship';
import type { OwnedItem } from '../types/item';
import { getShipDisplayLevel, getShipSchematicsDisplay, getShipSchematicsProgress } from './getters';
import Thumbnail from '../assets/Thumbnail';

export interface ShipsTableProps {
  ships: Ship[];
  items: OwnedItem[];
}

function ShipsTable({ ships, items }: ShipsTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Image</TableCell>
            <TableCell>Ship</TableCell>
            <TableCell align="right">Level</TableCell>
            <TableCell align="right">Schematics</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {ships.map((s, index) => (
            <TableRow key={s.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Thumbnail asset={s.icon} alt={s.name} />
              </TableCell>
              <TableCell>{s.name}</TableCell>
              <TableCell align="right">{getShipDisplayLevel(s)}</TableCell>
              <TableCell align="right">
                <Box sx={{ display: 'inline-block', minWidth: 100 }}>
                  <LinearProgress variant="determinate" value={getShipSchematicsProgress(s, items)} color="primary" />
                  <Typography variant="body2">{getShipSchematicsDisplay(s, items)}</Typography>
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default ShipsTable;
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run build --workspace=client && npm run lint --workspace=client`
Expected: both exit 0.

- [ ] **Step 3: Manual browser verification**

With the dev server still running, navigate to `/4-stars-ships` or `/5-stars-ships` (whichever has rows in the current cached data). Confirm:
- A new "Image" column header appears between `#` and "Ship".
- Each row shows either a 40×40 ship preview image or the grey placeholder box — no broken-image icons, no layout shift, no console errors.
- The existing Schematics progress bar/text in the last column is unaffected.

- [ ] **Step 4: Commit**

```bash
git add client/src/ships/ShipsTable.tsx
git commit -m "Add ship preview image column to ShipsTable"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1) — types + optional `portrait`/`icon` fields; URL construction (Task 1) — `ASSET_BASE_URL` + `getAssetUrl`, agnostic over any `{file}` shape; rendering component (Task 2) — `Thumbnail`, single placeholder path for both failure modes; column placement (Task 2 crew, Task 3 ships) — inserted right after `#`; error handling (Task 2) — covered by `Thumbnail`'s own logic, exercised visually in both manual-verification steps; verification (Task 1 script, Tasks 2–3 build/lint/manual) — all present. Phase 2 (backend caching) is explicitly out of scope per the spec and not included here.
- **Placeholder scan:** no TBD/TODO markers; every step has literal, complete code.
- **Type consistency:** `DatacoreAsset` defined once in Task 1, imported unchanged in Tasks 1–3; `getAssetUrl(asset: DatacoreAsset | undefined): string | undefined` signature identical everywhere it's referenced; `ThumbnailProps { asset: DatacoreAsset | undefined; alt: string }` defined once in Task 2, consumed identically in Task 3.
