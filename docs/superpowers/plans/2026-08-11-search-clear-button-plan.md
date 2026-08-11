# Search Clear Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clear ("×") button inside `TableSearchBar`'s input, right side, visible only when there's text to clear, that empties the field on click.

**Architecture:** One conditional `endAdornment` added to the shared `TableSearchBar` component's `TextField`. No other file changes — every page already passes the same `onChange` prop the clear button reuses.

**Tech Stack:** React 19, TypeScript, MUI v6.5.0 (`slotProps.input.endAdornment`, `IconButton`, `@mui/icons-material/Clear` — all already available, confirmed installed).

## Global Constraints

- The clear button renders only when `value` is a non-empty string — never on an empty input.
- Clicking it calls the existing `onChange` prop with `''` — no new prop, no new state inside `TableSearchBar`.
- `aria-label="Clear search"` on the button (closes a deferred accessibility Minor from the Table search feature's final review).
- No change to any of the 13 page call sites, `useSearch`, or `usePagination` — this is a single-file, purely additive UI change.
- Build (`npm run build -w client`) and lint (`npm run lint -w client`) must stay clean: 0 errors, only the 2 pre-existing `react-refresh/only-export-components` warnings.

---

### Task 1: Add the clear button to `TableSearchBar`

**Files:**
- Modify: `client/src/components/TableSearchBar.tsx`

**Interfaces:**
- No change to `TableSearchBarProps` (`value: string`, `onChange: (value: string) => void`, `placeholder?: string`) — the clear button is implemented entirely with the existing props.

- [ ] **Step 1: Add the endAdornment**

Replace the full contents of `client/src/components/TableSearchBar.tsx` with:

```tsx
import { IconButton, InputAdornment, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

export interface TableSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function TableSearchBar({ value, onChange, placeholder = 'Search by name…' }: TableSearchBarProps) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton size="small" aria-label="Clear search" onClick={() => onChange('')} edge="end">
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
      sx={{ width: 260 }}
    />
  );
}

export default TableSearchBar;
```

- [ ] **Step 2: Build and lint**

Run: `npm run build -w client` — expect success, 0 errors.
Run: `npm run lint -w client` — expect 0 errors, only the 2 pre-existing warnings.

- [ ] **Step 3: Real-browser verification**

Start the dev server, and using real Playwright navigation/clicking (not code-reading, not assuming) confirm on **two** routes — one `PageShell`-based page (e.g. `/5-stars-crew`) and the Overview page (`/`, which has two independent search boxes):

1. On page load, with the search box empty, the clear button (`button[aria-label="Clear search"]`) is **absent** (count 0).
2. Typing any text (even 1 character, before search "activates" at 3) makes the clear button **appear**.
3. Typing a real 3+ character query that produces a genuine partial match (0 < M < total — compute a real one against the seeded data first, same technique used throughout the Table search feature) filters the table as expected.
4. Clicking the clear button: the input becomes empty, the full unfiltered list is restored, the title/count returns to its unfiltered baseline, and the clear button itself disappears again.
5. **On the Overview page specifically:** clicking one section's clear button does not affect the other section's search box, heading, or table — confirm by reading both sections' actual state before and after the click.

Record the actual observed values (button presence/absence, title strings, row counts) in the task report — not the values you expect to see.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/TableSearchBar.tsx
git commit -m "Add a clear button to the table search input"
```
