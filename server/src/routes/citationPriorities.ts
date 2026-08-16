import { Router, type Response } from 'express';
import { computeCitationPriorities } from '../citation/computeCitationPriorities';
import { UpstreamError } from '../errors';

export function createCitationPrioritiesRouter(): Router {
  const router = Router();

  router.get('/citation-priorities', async (_req, res) => {
    try {
      const data = await computeCitationPriorities();
      res.json(data);
    } catch (err) {
      respondUpstreamError(res, err);
    }
  });

  return router;
}

function respondUpstreamError(res: Response, err: unknown): void {
  if (err instanceof UpstreamError) {
    res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
    return;
  }
  res.status(502).json({ error: 'Unexpected error computing citation priorities', code: 'UPSTREAM_ERROR' });
}
