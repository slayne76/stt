# Crew/ship image column (frontend, Phase 1) — design

Date: 2026-08-05

## Context

The user wants a thumbnail image column on every crew page and every ship
page, showing the crew member's portrait or the ship's preview art. This is
Phase 1 of a two-phase feature: this phase renders images by hotlinking
directly to the public asset host (`assets.datacore.app`); a later, separate
Phase 2 will add a Node-backend caching proxy so the browser stops hitting
that host on every page view (see "Deferred to Phase 2" below).

The original ask assumed the image URL would need to be *predicted* from the
crew/ship's display name via some slugification scheme. Investigation against
the real `example-data.json` payload disproved this: both crew and ship
objects already carry the exact asset path in the payload, under a `{file}`
object —

- Crew: `crew.portrait.file === "/crew_portraits/cm_pike_amand_rauth_sm"`
- Ships: `ship.icon.file === "/ship_previews/fed_arctic_one"`

— which map directly to the real asset URLs the user provided
(`crew_portraits_cm_pike_amand_rauth_sm.png`, `ship_previews_fed_arctic_one.png`)
by stripping the leading `/`, replacing internal `/` with `_`, and appending
`.png`. Verified against 4 real ship entries and 2 real crew entries,
including one ship whose filename contains an upstream typo
(`alternate_probabilitly_cerritos`) that still matched exactly, because the
path comes straight from the payload rather than being reconstructed from the
display name. No name-based prediction/slugification is needed at all.

This also directly serves the user's "make this agnostic for future assets"
requirement: crew objects carry `full_body.file` and `icon.file` in the same
shape, and ships carry `schematic_icon.file` — one generic
"build a URL from a `{file}` object" function covers all of them.

## Data model

New shared type, since both crew and ships need it and future asset kinds
will too:

```ts
// client/src/types/asset.ts
export interface DatacoreAsset {
  file: string; // e.g. "/crew_portraits/cm_pike_amand_rauth_sm"
}
```

Two existing types each gain one optional field, following this project's
established "type only what you use, defensively" convention (see
`docs/PROJECT_STATE.md`'s `CrewMember`/`OwnedItem` discipline):

- `CrewMember` (`client/src/types/crew.ts`) gains `portrait?: DatacoreAsset`
- `Ship` (`client/src/types/ship.ts`) gains `icon?: DatacoreAsset`

Both optional — real data always has them, but nothing validates the raw JSON
shape at the client boundary (`PlayerData` stays `Record<string, unknown>`),
so every consumer must tolerate a missing field without throwing.

## URL construction

New top-level module, `client/src/assets/` (sibling to `crew/`,
`collections/`, `ships/`):

```ts
// client/src/assets/config.ts
export const ASSET_BASE_URL = 'https://assets.datacore.app';
```

```ts
// client/src/assets/getAssetUrl.ts
import { ASSET_BASE_URL } from './config';
import type { DatacoreAsset } from '../types/asset';

export function getAssetUrl(asset: DatacoreAsset | undefined): string | undefined {
  if (!asset?.file) return undefined;
  const path = asset.file.replace(/^\//, '').replace(/\//g, '_');
  return `${ASSET_BASE_URL}/${path}.png`;
}
```

This is the one function every asset-typed column will call, regardless of
whether it's a crew portrait, a ship preview, or a future items/rewards icon
— no per-asset-type branching. `ASSET_BASE_URL` being pulled into its own
constant is the specific seam Phase 2 will repoint (e.g. to a local
`/api/assets`-style path) without touching `getAssetUrl`'s logic at all.

## Rendering component

Shared component in the same module, used by both `CrewTable` and
`ShipsTable`:

```tsx
// client/src/assets/Thumbnail.tsx
import { useState } from 'react';
import Box from '@mui/material/Box';
import { getAssetUrl } from './getAssetUrl';
import type { DatacoreAsset } from '../types/asset';

interface ThumbnailProps {
  asset: DatacoreAsset | undefined;
  alt: string;
}

export function Thumbnail({ asset, alt }: ThumbnailProps) {
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
```

- 40px square thumbnail, per user's explicit choice (over a larger size or a
  circular avatar crop).
- Two distinct failure modes — "no `{file}` data at all" (`!url`) and "URL
  present but the image failed to load" (`onError`, e.g. a renamed/removed
  upstream asset) — deliberately collapse to the exact same placeholder
  rendering path, not two different ones. This is also the single point
  where a real placeholder image (to be supplied by the user later) replaces
  the grey `Box` — one-line change, one call site.
- `alt` is supplied by the caller (`crew.name` / `ship.name`) for
  accessibility; not derived inside `Thumbnail` itself, since the component
  has no opinion about what kind of entity it's rendering.

## Column placement

- `CrewTable.tsx`: new "Image" column inserted immediately after `#`, before
  `Stars` → `#, Image, Stars, Name, Level, Items to equip, Collections`.
  Renders `<Thumbnail asset={crew.portrait} alt={crew.name} />`.
- `ShipsTable.tsx`: new "Image" column inserted immediately after `#`, before
  `Ship` → `#, Image, Ship, Level, Schematics`. Renders
  `<Thumbnail asset={ship.icon} alt={ship.name} />`.

Both tables are the single shared rendering layer for all 6 crew pages and 2
ship pages (see `docs/PROJECT_STATE.md`'s "The shared rendering layer"
section — `CrewTable`/`ShipsTable` are each reused unmodified across every
page in their domain). This means the entire feature is two component edits
plus the two type edits above; every crew/ship page picks up the new column
automatically, with zero per-page changes.

## Error handling

- Missing `portrait`/`icon` field entirely (some real crew/ships may lack
  one): `getAssetUrl` returns `undefined`, `Thumbnail` renders the
  placeholder. No console error, no thrown exception.
- Field present but the image 404s or otherwise fails to load (asset
  renamed/removed upstream, network hiccup): `onError` flips `Thumbnail` to
  the same placeholder. No retry — a single load attempt per render is
  sufficient for a local single-user tool.
- No further validation of `asset.file`'s shape beyond the `?.file` optional
  chain — consistent with this project's existing fail-closed convention for
  every other unvalidated field (see `getMissingEquipmentArchetypeIds`'s
  `equipment_slots` guard in `docs/PROJECT_STATE.md`).

## Verification

Consistent with this project's no-automated-test-framework convention: a
throwaway `client/src/assets/__verify.ts` script (run via `npx tsx`, deleted
before commit) that reads `example-data.json`, runs `getAssetUrl` over the
crew/ship entries the user's example URLs came from (`Amand Rauth Pike`,
`Bold Boimler`, `Arctic One`, `Alternate Probability Cerritos`), and asserts
the output matches the known-good URLs exactly, plus a spot-check that a
sample of other real crew/ship entries produce well-formed (non-`undefined`,
correctly-encoded) URLs. Followed by a manual dev-server check that
thumbnails actually render on at least one crew page and one ship page.

## Deferred to Phase 2 (explicitly out of scope for this spec)

- A Node-backend caching/proxy layer so the browser loads assets from the
  local server instead of hotlinking `assets.datacore.app` directly on every
  page view, avoiding repeated requests to the public host.
- Whatever refresh mechanism controls when the local cache is
  updated/invalidated (tied to the existing "Refresh" button, a separate
  dedicated button, or something else — to be brainstormed as its own
  feature once this frontend slice is in place).
- Repointing `ASSET_BASE_URL` (or introducing an equivalent server-relative
  constant) once the proxy exists.

## Out of scope entirely

- Any change to which asset variant is shown (portrait vs. full-body vs.
  icon) — this spec always uses `portrait` for crew and `icon` for ships,
  matching the user's example URLs.
- Extending the image column to items/rewards or any other asset kind — the
  `getAssetUrl`/`Thumbnail` design supports this trivially later, but no new
  column is added for them in this spec.
