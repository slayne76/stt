import { Router } from 'express';
import dilemmasJson from '../data/dilemmas.json';
import type { DilemmasResponse } from '../dilemmasTypes';

// `resolveJsonModule` infers each JSON string field as plain `string`, which
// is never assignable to the narrower `'A' | 'B' | 'C'` on Choice.letter —
// a checked assignment to DilemmasResponse fails to compile for that reason
// alone, so this is a type assertion, not a plain declaration. It is still
// the only shape validation this static, hand-maintained file gets, and
// `tsc` will still catch a genuinely wrong shape (e.g. a missing `dilemmas`
// key, or a field renamed on one side but not the other) — `as` only
// tolerates the literal-widening gap, not arbitrary mismatches.
const DILEMMAS = dilemmasJson as DilemmasResponse;

export function createDilemmasRouter(): Router {
  const router = Router();

  router.get('/dilemmas', (_req, res) => {
    res.json(DILEMMAS);
  });

  return router;
}
