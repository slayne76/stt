import { Router } from 'express';
import dilemmasJson from '../data/dilemmas.json';
import type { DilemmasResponse } from '../dilemmasTypes';

// `resolveJsonModule` infers each JSON string field as plain `string`, which
// is never assignable to the narrower `'A' | 'B' | 'C'` on Choice.letter —
// a checked assignment to DilemmasResponse fails to compile for that reason
// alone, so this is a type assertion, not a plain declaration. It is still
// the only shape validation this static, hand-maintained file gets, and
// `tsc` will catch a genuinely wrong shape for most fields (e.g. a missing
// `dilemmas` key, or a field renamed on one side but not the other) — `as`
// only tolerates the literal-widening gap, not arbitrary mismatches.
// EXCEPTION: this does NOT hold for Reward's `type: 'crew' | 'ship'`
// discriminant. Excess-property checking doesn't apply through a JSON-module
// type, and a JSON object with `type` omitted (or misspelled) remains
// structurally assignable to `Reward` either direction via `as`, so `tsc`
// gives no error in that case — you get no runtime error either, just a
// silently broken rendering cell on the client. There is currently no
// automated check for this: when hand-adding a reward to dilemmas.json,
// `"type": "crew" | "ship"` must be set correctly by hand every time.
const DILEMMAS = dilemmasJson as DilemmasResponse;

export function createDilemmasRouter(): Router {
  const router = Router();

  router.get('/dilemmas', (_req, res) => {
    res.json(DILEMMAS);
  });

  return router;
}
