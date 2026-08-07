# Page Shell Extraction — Design

## What this is

Seven pages (`ThreeFourStarsCrewPage`, `FourFiveStarsCrewPage`,
`FourFourStarsCrewReadyPage`, `FourFourStarsCrewPage`,
`FrozenDuplicatesPage`, `CollectionsPage`, `ShipsPage`) repeat an
identical ~25-line JSX shell: a title with a parenthetical count, a
loading spinner, an error `Alert` with a Retry action, and then either
an empty-state message or the page's table. Each addition of a new
page has copied this block verbatim — flagged as a deferred-issues
backlog item since the 4th crew page, re-flagged at every subsequent
page's final review, now at 7 copies, "well past the threshold every
prior review named."

**Verified byte-identical across all 7** — read every one of the 7
files directly rather than assuming from the backlog's description.
The only differences between pages are: the title string, the specific
list being counted (`crew`/`collections`/`ships`), the empty-state
message string, and which table component renders as the "loaded,
non-empty" content. The data-fetching and filtering/sorting logic above
the JSX is genuinely different per page (different filters, different
sort keys, different domain types) and is correctly **not** part of
this extraction — only the shell.

`OverviewPage` is excluded — a key-value table of Player ID/DBID with
no list/count/empty-state shape, structurally unrelated to this pattern.

## The extraction

New `client/src/layout/PageShell.tsx` — a pure presentational
component, decoupled from `PlayerData`/data-fetching entirely (it only
knows about booleans, strings, a number, and a retry callback):

```tsx
import type { ReactNode } from 'react';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';

export interface PageShellProps {
  title: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loaded: boolean;
  count: number;
  emptyMessage: string;
  children: ReactNode;
}

function PageShell({ title, loading, error, onRetry, loaded, count, emptyMessage, children }: PageShellProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="h4">
        {title}
        {loaded ? ` (${count})` : ''}
      </Typography>

      {loading && <CircularProgress />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loaded && (count === 0 ? <Typography color="text.secondary">{emptyMessage}</Typography> : children)}
    </Stack>
  );
}

export default PageShell;
```

**`layout/`, not `pages/` or a new top-level module** — this is a
shared structural UI primitive in the same category as `AppLayout.tsx`
(wraps the whole app) and `NavGroupItem.tsx` (a shared nav element);
`PageShell` is the same idea one level down, wrapping an individual
page's content.

**Deliberately left un-extracted, by design, not oversight:**
- **`loaded`'s computation stays in each page** (`!loading && !error &&
  !!data`, one line) rather than `PageShell` inferring it from a `data`
  prop. Passing the raw `PlayerData` down would couple a presentational
  component to a domain type it has no other reason to know about;
  passing a plain `loaded: boolean` keeps `PageShell` genuinely
  reusable for anything with a loading/error/loaded shape, not just
  this app's specific data-fetching hook.
- **`onRetry` takes a plain `() => void`**, not `refresh: () => Promise<void>`.
  Each page still does its own `onRetry={() => void refresh()}` — the
  `void`-wrapping (needed to satisfy this project's
  no-floating-promises lint rule) is a caller concern, not something
  `PageShell` should need to understand.
- **All data-fetching, filtering, and sorting logic stays in each
  page**, unchanged. Only the render shell moves.

## Per-page changes

Each of the 7 pages keeps its own `usePlayerData()` call and all of its
own data-derivation code verbatim, then replaces its ~25-line
`<Stack>...</Stack>` return block with a `<PageShell>` call wrapping
its table as `children`. Worked example (`ThreeFourStarsCrewPage.tsx`,
representative of all 4 plain crew pages):

```tsx
function ThreeFourStarsCrewPage() {
  const { data, loading, error, refresh } = usePlayerData();

  const collections = data ? getCollectionsList(data) : [];
  const crew = data
    ? sortCrew(
        filterByRarity(getCrewList(data), { rarity: 3, maxRarity: 4 }),
        combineComparators(byLevelDesc, byEquipmentSlotsRemainingDesc, byCollectionCountDesc(collections), byNameAsc)
      )
    : [];

  const loaded = !loading && !error && !!data;

  return (
    <PageShell
      title="3/4 Stars crew"
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      loaded={loaded}
      count={crew.length}
      emptyMessage="No crew at 3/4 stars."
    >
      <CrewTable crew={crew} collections={collections} />
    </PageShell>
  );
}
```

**`FrozenDuplicatesPage` and `ShipsPage`** already receive `title` as a
prop (they're the internal, parameterized components behind thin
per-rarity wrapper pages) — that prop passes straight through to
`PageShell`'s `title`, no change to either component's own
`Props` interface.

**One subtlety worth calling out:** the original `loaded` expression
was `!loading && !error && data` (a truthy check on the `PlayerData`
object itself, not coerced to boolean) — used only inside a `&&` JSX
guard, where a truthy-but-non-boolean value works fine at the call
site but would be the wrong type for a prop explicitly typed
`boolean`. The extraction adds `!!data` (or equivalently `Boolean(data)`)
at each page's `loaded` computation — a type-correctness fix with zero
behavioral difference, not a logic change.

## Scope

1 new file (`client/src/layout/PageShell.tsx`) + 7 modified pages:
`client/src/pages/ThreeFourStarsCrewPage.tsx`,
`FourFiveStarsCrewPage.tsx`, `FourFourStarsCrewReadyPage.tsx`,
`FourFourStarsCrewPage.tsx`, `FrozenDuplicatesPage.tsx`,
`CollectionsPage.tsx`, `ShipsPage.tsx`. No changes to `OverviewPage.tsx`,
any table component (`CrewTable`, `CollectionsTable`, `ShipsTable`), any
getter/filter/sorter, or `App.tsx`'s routes.

## Verification

This project has no automated test framework (deliberate, project-wide
choice). Since the extraction is a JSX-structure move with a couple of
prop-plumbing points (not a pure zero-risk import move like the last two
refactors — the `Stack`/`Typography`/`Alert`/spinner tree is being
relocated, not just re-pointed), verification is TypeScript strict mode
+ ESLint plus interactive browser checks via the `playwright` MCP
tooling against a real running dev server, covering the full state
matrix per page type:
- **Loading state:** confirm the spinner renders (can be observed
  briefly on a hard reload, or by checking the component tree
  immediately after navigation before data resolves).
- **Error state:** confirm the error `Alert` and its Retry button
  render and that clicking Retry re-triggers the fetch (existing
  behavior, regression check).
- **Loaded, non-empty:** confirm the title shows the correct count and
  the correct table renders with real data — checked on at least one
  page of each of the three table-consuming shapes (`CrewTable`,
  `CollectionsTable`, `ShipsTable`), not just one page overall, since
  each wires different props into `children`.
- **Loaded, empty:** the real data sample may not naturally produce an
  empty result for every page today, so this is checked by reading the
  code path (the `count === 0` branch is identical logic to before,
  just relocated) rather than forcing an artificial empty state — same
  category of "verified by construction, not by chance-dependent live
  data" reasoning this project has used before (e.g. the `MAXED_OUT_RATIO`
  sentinel).
