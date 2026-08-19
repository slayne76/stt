# Retrievable Crew — Add/Edit/Delete UI — Design

**Date:** 2026-08-20
**Status:** Approved

## Problem

The Retrievable Crew page (`/retrievable-crew`, shipped 2026-08-19) is read-only: the curated list at `server/data/retrievable-crew.json` can only be changed by hand-editing the file. `writeRetrievableCrew()` already exists in storage but no route calls it. This phase adds the deferred editable UI: add a crew, edit an existing row's crew and/or chosen Polestars, delete a row — all through the app, writing to the same storage.

## Design

### Server: write endpoints

`server/src/routes/retrievableCrew.ts` gains three routes alongside the existing `GET`, all built on the existing `readRetrievableCrew()`/`writeRetrievableCrew()`:

- **`POST /api/retrievable-crew`** — add. Body: `{ archetypeId: number, polestars: (number | null)[] }`.
  Validation (400 on any failure, with a plain-English `error` message): `archetypeId` must be a positive integer; `polestars` must be an array of at most 4 entries, each `null` or a positive integer, with no duplicate non-null values. Returns 409 if `archetypeId` already exists in the store. On success: normalize `polestars` to exactly 4 slots (pad with `null` / truncate — same normalization the client's `buildRetrievableCrewRows` already does defensively on read), append, write, return the full updated `RetrievableCrewEntry[]` with 201.
- **`PUT /api/retrievable-crew/:archetypeId`** — edit. `:archetypeId` (path) identifies the row being replaced. Body: `{ archetypeId: number, polestars: (number | null)[] }` — body `archetypeId` may differ from the path param (the row's crew was changed). 404 if the path `archetypeId` has no matching row. 409 if the body `archetypeId` differs from the path one *and* already belongs to a different existing row. Same shape validation and normalization as POST. Replaces the entry (at its new key if the crew changed), writes, returns the full updated list with 200.
- **`DELETE /api/retrievable-crew/:archetypeId`** — 404 if no matching row, otherwise removes it, writes, returns the full updated list with 200.

All three return the full array (not just the touched row) — the client replaces its whole context `data` state from the response, so there's exactly one shape of "the list changed" for consumers to handle, matching how `refresh()` already works for the read path. None of these validate `archetypeId` against the live crew catalog or `polestars` entries against the live Polestar catalog — that's enforced client-side (see below); the server only guards structural integrity of the stored JSON.

### Client: API + context

- `client/src/api/retrievableCrewApi.ts` gains `addRetrievableCrew(entry)`, `updateRetrievableCrew(archetypeId, entry)`, `deleteRetrievableCrew(archetypeId)` — same fetch-and-throw-on-`!ok` shape as the existing `fetchRetrievableCrew`, each resolving to the response's `RetrievableCrewEntry[]`.
- `RetrievableCrewContext` gains three methods (`addEntry`, `updateEntry`, `deleteEntry`) that call the corresponding API function and `setData()` directly from its response — no extra `refresh()` round-trip. Errors are thrown up to the caller (the dialog), not swallowed into context `error` state, since these are user-initiated actions with their own inline error UI (Snackbar), distinct from the page-load `error` state.

### Client: selection state

`RetrievableCrewPage` owns `selectedArchetypeId: number | null`. Passed to `RetrievableCrewTable` (renders the checkbox column, calls back on toggle) and to a new `RetrievableCrewActions` component (the Add/Edit/Delete buttons) rendered via `PageShell`'s existing `titleActions` slot.

- Checkbox column is single-select: selecting a row deselects any previously-selected one; clicking the already-selected row's own checkbox clears the selection.
- Selection is cleared after every successful Add/Edit/Delete, resetting the buttons to their initial state (Add enabled, Edit/Delete disabled).
- Add is always enabled. Edit and Delete are enabled only while exactly one row is selected.

### Client: shared form dialog (Add + Edit)

One `RetrievableCrewFormDialog` component, `mode: 'add' | 'edit'`, `initialEntry?: RetrievableCrewEntry` (edit only). A MUI `Dialog` containing:

**1. Crew name field** — MUI `Autocomplete`, `freeSolo` (typing is never blocked, submission doesn't require picking a suggestion). Options = crew catalog entries where `polestarFilterKeys.length > 0` **and** not already tracked by a *different* row in the current `retrievableCrew` list (in edit mode, the row's own starting crew remains an eligible option even though it's technically "tracked" — excluded from the "already tracked" set by archetype ID, not by name). `filterOptions` returns no suggestions below 3 characters typed; at 3+, case-insensitive substring match on `name`, capped at 25 shown.

**2. Polestar picker** — once the typed text resolves to an exact-name match against an eligible, not-elsewhere-tracked catalog entry, this section renders one badge per entry in `resolveEligiblePolestars(catalogEntry.polestarFilterKeys, polestarCatalog)`: the same circular-badge visual as the table (`Thumbnail` + `circleBackgroundColor` by `getPolestarTypeColor(filter.type)` + short name), grey background when unselected. Before a valid crew is resolved, shows placeholder text ("Type a crew name to see its eligible Polestars") instead.

Clicking an unselected badge selects it (colored background); clicking a selected badge deselects it. Once 4 are selected, remaining unselected badges become disabled (non-interactive, visually dimmed) until one of the 4 is freed. Selection order maps to storage slot order (Polestar #1 = first selected, etc.) — slot position carries no gameplay meaning (confirmed in the original feature's design doc), so this is an arbitrary but stable assignment.

**Edit-mode crew swap:** if the resolved crew changes to a different `archetypeId` than `initialEntry.archetypeId`, all 4 Polestar selections reset to unselected immediately (the old crew's pool essentially never overlaps the new one).

**Validation**, checked on Submit and live-recomputed while an error is showing (so it clears as soon as the user fixes it):
- Name doesn't resolve to a valid, eligible, not-elsewhere-tracked crew → red border on the `Autocomplete` input + helper text below it ("Enter a valid crew name" / "`<name>` is already tracked").
- Zero Polestars selected → red outline around the Polestar picker section + helper text below it ("Select at least 1 Polestar").

Both must pass before Submit calls the API. Submit disables itself and shows an inline spinner while the request is in flight (same convention as the topbar Refresh button). On success: dialog closes, page selection clears, green success `Snackbar` ("Added `<crew>`." / "Updated `<crew>`."). On failure: dialog stays open (preserving in-progress input), red error `Snackbar` with the server's message.

### Client: delete confirmation

New `DeleteConfirmDialog` — plain MUI `Dialog`, "Delete `<crew name>` from Retrievable Crew?" with Cancel and a red Delete button. Confirm calls `deleteEntry`; success closes the dialog, clears selection, green success Snackbar; failure leaves the dialog open with a red error Snackbar (retry or Cancel). Cancel closes with no API call.

### Reused conventions

- `Snackbar`/`Alert` success+error pattern: matches `AppLayout.tsx`'s existing catalog-refresh Snackbars (6s auto-hide, dismissible).
- Circular Polestar badges: reuses `Thumbnail`'s existing `circleBackgroundColor` prop and `getPolestarTypeColor`, both already shipped for the read-only table — no new color logic.
- Disabled-during-request submit button: matches the topbar Refresh button's existing loading-state handling.

This is the first `Dialog`/`Autocomplete` usage anywhere in the app — both are stock MUI components already available via the existing `@mui/material` dependency, no new package needed.

## Non-goals

- No bulk add/edit/delete (multi-row selection) — single-row only, per your spec.
- No server-side validation of `archetypeId`/`polestars` against the live crew/Polestar catalogs — client-side restriction (autocomplete options, picker options) is the only gate; server only checks structural shape.
- No optimistic concurrency / conflict handling on the storage file — single local user, matches the existing "hand-authored local state" framing of `retrievableCrewStore.ts`.
- No undo for delete beyond the confirm dialog itself.
- No change to the existing read-only rendering (`buildRetrievableCrewRows`, `RetrievableCrewTable`'s existing columns) beyond adding the new checkbox column.

## Verification plan

- `tsc -b client` and `tsc --noEmit -p server` clean.
- Live Playwright pass against the running dev server, checking `server/data/retrievable-crew.json` directly after each step (not just the UI):
  1. Add a crew → row appears, survives a page refresh, file on disk has the new entry with correctly-ordered `polestars`.
  2. Edit a crew's Polestars only (same crew) → icons update in the table, persists on disk.
  3. Edit a crew's *name* to a different crew → old archetype's row disappears, new one appears with Polestars reset to empty, disk file reflects the new `archetypeId` key.
  4. Type a non-matching/invalid name → red border + message, Submit never fires an API call.
  5. Type a name already tracked by a different row → blocked with the duplicate message; confirm the *current* row's own crew name does NOT trigger this in edit mode.
  6. With 4 Polestars selected, click a 5th → no-op, remains disabled.
  7. Delete → confirm dialog → row removed from table and disk.
  8. Delete → Cancel → row survives, confirm no API call was made (network log check).
  9. Checkbox single-select: selecting row B while row A is selected deselects A; Edit/Delete stay enabled throughout with exactly one target.
