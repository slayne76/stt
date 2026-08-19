import { Router } from 'express';
import { readRetrievableCrew } from '../retrievableCrewStore';

export function createRetrievableCrewRouter(): Router {
  const router = Router();

  router.get('/retrievable-crew', (_req, res) => {
    res.json(readRetrievableCrew());
  });

  return router;
}
