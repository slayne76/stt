import { Router } from 'express';
import { readRetrievableCrew, writeRetrievableCrew } from '../retrievableCrewStore';
import type { RetrievableCrewEntry } from '../retrievableCrewTypes';

const MAX_POLESTAR_SLOTS = 4;

// Structural validation only — does NOT check archetypeId/polestars against
// the live crew/Polestar catalogs. That's a deliberate scope decision (see
// design doc Non-goals): the client-side Autocomplete/picker are the only
// gate for "is this a real, eligible crew/Polestar". This just guards the
// stored JSON's shape.
function isValidPolestarsArray(value: unknown): value is (number | null)[] {
  if (!Array.isArray(value) || value.length > MAX_POLESTAR_SLOTS) return false;
  const nonNullIds: number[] = [];
  for (const item of value) {
    if (item === null) continue;
    if (typeof item !== 'number' || !Number.isInteger(item) || item <= 0) return false;
    nonNullIds.push(item);
  }
  return new Set(nonNullIds).size === nonNullIds.length; // no duplicate ids within one row
}

// Always exactly 4 slots on write, same normalization convention the client
// already applies defensively on read (buildRetrievableCrewRows).
function normalizePolestars(value: (number | null)[]): (number | null)[] {
  return Array.from({ length: MAX_POLESTAR_SLOTS }, (_, i) => value[i] ?? null);
}

function parseBody(body: unknown): RetrievableCrewEntry | null {
  if (typeof body !== 'object' || body === null) return null;
  const { archetypeId, polestars } = body as Record<string, unknown>;
  if (typeof archetypeId !== 'number' || !Number.isInteger(archetypeId) || archetypeId <= 0) return null;
  if (!isValidPolestarsArray(polestars)) return null;
  return { archetypeId, polestars: normalizePolestars(polestars as (number | null)[]) };
}

function parsePathArchetypeId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function createRetrievableCrewRouter(): Router {
  const router = Router();

  router.get('/retrievable-crew', (_req, res) => {
    res.json(readRetrievableCrew());
  });

  router.post('/retrievable-crew', (req, res) => {
    const parsed = parseBody(req.body);
    if (!parsed) {
      res.status(400).json({ error: 'Invalid archetypeId or polestars in request body' });
      return;
    }
    const entries = readRetrievableCrew();
    if (entries.some((e) => e.archetypeId === parsed.archetypeId)) {
      res.status(409).json({ error: 'This crew is already tracked' });
      return;
    }
    const updated: RetrievableCrewEntry[] = [...entries, parsed];
    writeRetrievableCrew(updated);
    res.status(201).json(updated);
  });

  router.put('/retrievable-crew/:archetypeId', (req, res) => {
    const pathId = parsePathArchetypeId(req.params.archetypeId);
    if (pathId === null) {
      res.status(400).json({ error: 'Invalid archetypeId in URL' });
      return;
    }
    const parsed = parseBody(req.body);
    if (!parsed) {
      res.status(400).json({ error: 'Invalid archetypeId or polestars in request body' });
      return;
    }
    const entries = readRetrievableCrew();
    const existingIndex = entries.findIndex((e) => e.archetypeId === pathId);
    if (existingIndex === -1) {
      res.status(404).json({ error: 'No tracked crew found for that archetypeId' });
      return;
    }
    // The body's archetypeId may differ from the path's (the row's crew was
    // changed) — only reject if it collides with a DIFFERENT existing row.
    const collidesWithAnotherRow = entries.some((e, i) => i !== existingIndex && e.archetypeId === parsed.archetypeId);
    if (collidesWithAnotherRow) {
      res.status(409).json({ error: 'This crew is already tracked by another row' });
      return;
    }
    const updated = [...entries];
    updated[existingIndex] = parsed;
    writeRetrievableCrew(updated);
    res.json(updated);
  });

  router.delete('/retrievable-crew/:archetypeId', (req, res) => {
    const pathId = parsePathArchetypeId(req.params.archetypeId);
    if (pathId === null) {
      res.status(400).json({ error: 'Invalid archetypeId in URL' });
      return;
    }
    const entries = readRetrievableCrew();
    const existingIndex = entries.findIndex((e) => e.archetypeId === pathId);
    if (existingIndex === -1) {
      res.status(404).json({ error: 'No tracked crew found for that archetypeId' });
      return;
    }
    const updated = entries.filter((e) => e.archetypeId !== pathId);
    writeRetrievableCrew(updated);
    res.json(updated);
  });

  return router;
}
