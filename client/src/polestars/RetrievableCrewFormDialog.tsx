import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { CatalogEntry } from '../types/catalogEntry';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import { getEligibleRetrievableCandidates, resolveEligiblePolestars } from './getters';
import PolestarBadge from './PolestarBadge';

const MAX_POLESTARS = 4;
const MIN_SEARCH_LENGTH = 3;
const MAX_SUGGESTIONS = 25;

export interface RetrievableCrewFormDialogProps {
  open: boolean;
  mode: 'add' | 'edit';
  // Required (non-null) when mode === 'edit'; ignored in 'add' mode.
  initialEntry: RetrievableCrewEntry | null;
  catalog: CatalogEntry[];
  polestarCatalog: PolestarCatalogEntry[];
  // Archetype IDs already tracked by ANY row, including the one being
  // edited — duplicate detection subtracts initialEntry's own id itself.
  trackedArchetypeIds: Set<number>;
  onClose: () => void;
  // Rejecting keeps the dialog open (the caller is expected to have already
  // surfaced the error, e.g. via a Snackbar) — resolving closes it.
  onSubmit: (entry: RetrievableCrewEntry) => Promise<void>;
}

function filterCrewOptions(options: CatalogEntry[], inputValue: string): CatalogEntry[] {
  const query = inputValue.trim().toLowerCase();
  if (query.length < MIN_SEARCH_LENGTH) return [];
  return options.filter((o) => o.name.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS);
}

function RetrievableCrewFormDialog({
  open,
  mode,
  initialEntry,
  catalog,
  polestarCatalog,
  trackedArchetypeIds,
  onClose,
  onSubmit,
}: RetrievableCrewFormDialogProps) {
  const [nameInput, setNameInput] = useState('');
  const [selectedPolestarIds, setSelectedPolestarIds] = useState<number[]>([]);
  const [resolvedArchetypeId, setResolvedArchetypeId] = useState<number | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [polestarError, setPolestarError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // (Re)initialize whenever the dialog opens — covers both a fresh Add and
  // re-opening Edit on a (possibly different) selected row.
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialEntry) {
      const crew = catalog.find((c) => c.archetype_id === initialEntry.archetypeId);
      setNameInput(crew?.name ?? '');
      setSelectedPolestarIds(initialEntry.polestars.filter((id): id is number => id !== null));
      setResolvedArchetypeId(initialEntry.archetypeId);
    } else {
      setNameInput('');
      setSelectedPolestarIds([]);
      setResolvedArchetypeId(null);
    }
    setNameError(null);
    setPolestarError(null);
    setSubmitting(false);
  }, [open, mode, initialEntry, catalog]);

  // Broader than the autocomplete's own suggestion list — includes
  // already-tracked crew, so typing an exact duplicate name still resolves
  // to a real CatalogEntry (letting the "already tracked" check below fire
  // with a specific message, instead of the generic "invalid name" one).
  const eligiblePool = useMemo(() => catalog.filter((c) => c.polestarFilterKeys.length > 0), [catalog]);

  const autocompleteOptions = useMemo(
    () => getEligibleRetrievableCandidates(catalog, trackedArchetypeIds, initialEntry?.archetypeId ?? null),
    [catalog, trackedArchetypeIds, initialEntry]
  );

  const resolvedCrew = useMemo(
    () => eligiblePool.find((c) => c.name.trim().toLowerCase() === nameInput.trim().toLowerCase()) ?? null,
    [eligiblePool, nameInput]
  );

  // Changing to a genuinely different crew than the one the dialog started
  // with invalidates the old Polestar selections (a different crew's
  // eligible pool almost certainly doesn't overlap) — reset rather than try
  // to partially preserve them. We deliberately do NOT null resolvedArchetypeId
  // when resolvedCrew is transiently null (e.g. mid-edit while the typed name
  // doesn't currently match any crew): doing so would make retyping the exact
  // original name look like "a genuinely different crew" and wipe selections
  // that were never actually invalidated. Keeping the last-resolved id means a
  // real change to a different crew still resets correctly, while a transient
  // invalid state followed by restoring the original name does not.
  useEffect(() => {
    if (resolvedCrew && resolvedCrew.archetype_id !== resolvedArchetypeId) {
      setSelectedPolestarIds([]);
      setResolvedArchetypeId(resolvedCrew.archetype_id);
    }
  }, [resolvedCrew, resolvedArchetypeId]);

  const eligiblePolestars = useMemo(
    () => (resolvedCrew ? resolveEligiblePolestars(resolvedCrew.polestarFilterKeys, polestarCatalog) : []),
    [resolvedCrew, polestarCatalog]
  );

  function handleNameInputChange(_event: unknown, newValue: string) {
    setNameInput(newValue);
    setNameError(null);
  }

  function togglePolestar(id: number) {
    setSelectedPolestarIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_POLESTARS) return prev; // defensive; the badge is also disabled at this point
      return [...prev, id];
    });
    setPolestarError(null);
  }

  async function handleSubmit() {
    const candidate = resolvedCrew;
    let nextNameError: string | null = null;
    if (!candidate) {
      nextNameError = 'Enter a valid crew name.';
    } else if (
      trackedArchetypeIds.has(candidate.archetype_id) &&
      candidate.archetype_id !== initialEntry?.archetypeId
    ) {
      nextNameError = `${candidate.name} is already tracked.`;
    }
    const nextPolestarError = selectedPolestarIds.length === 0 ? 'Select at least 1 Polestar.' : null;

    setNameError(nextNameError);
    setPolestarError(nextPolestarError);
    if (nextNameError || nextPolestarError || !candidate) return;

    const polestars: (number | null)[] = Array.from({ length: MAX_POLESTARS }, (_, i) => selectedPolestarIds[i] ?? null);
    setSubmitting(true);
    try {
      await onSubmit({ archetypeId: candidate.archetype_id, polestars });
      onClose();
    } catch {
      // Caller already surfaced the failure (e.g. a Snackbar) — keep the
      // dialog open with the user's input intact so they can retry.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{mode === 'add' ? 'Add Retrievable Crew' : 'Edit Retrievable Crew'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Autocomplete<CatalogEntry, false, false, true>
            freeSolo
            options={autocompleteOptions}
            getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
            filterOptions={(options, state) => filterCrewOptions(options, state.inputValue)}
            inputValue={nameInput}
            onInputChange={handleNameInputChange}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Crew name"
                autoFocus
                error={nameError !== null}
                helperText={nameError ?? 'Type at least 3 characters to search'}
              />
            )}
          />
          {resolvedCrew ? (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Polestars (choose up to {MAX_POLESTARS})
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                  p: 1,
                  border: polestarError ? '1px solid' : 'none',
                  borderColor: 'error.main',
                  borderRadius: 1,
                }}
              >
                {eligiblePolestars.map((entry) => {
                  const selected = selectedPolestarIds.includes(entry.id);
                  return (
                    <PolestarBadge
                      key={entry.id}
                      entry={entry}
                      selected={selected}
                      disabled={!selected && selectedPolestarIds.length >= MAX_POLESTARS}
                      onClick={() => togglePolestar(entry.id)}
                    />
                  );
                })}
              </Box>
              {polestarError && (
                <Typography variant="caption" color="error">
                  {polestarError}
                </Typography>
              )}
            </Box>
          ) : (
            <Typography color="text.secondary">Type a crew name to see its eligible Polestars.</Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default RetrievableCrewFormDialog;
