import { Router, type Response } from 'express';
import { fetchPolestarCatalog, type PolestarCatalogEntry } from '../polestarCatalogClient';
import {
  readPolestarCatalogCache,
  writePolestarCatalogCache,
  isPolestarCatalogCacheFresh,
} from '../polestarCatalogCache';
import { UpstreamError } from '../errors';

export function createPolestarCatalogRouter(): Router {
  const router = Router();

  router.get('/polestar-catalog', async (_req, res) => {
    const cached = readPolestarCatalogCache();
    if (cached !== null && isPolestarCatalogCacheFresh()) {
      res.json(cached);
      return;
    }
    try {
      const data = await fetchLiveAndCache();
      res.json(data);
    } catch (err) {
      if (cached !== null) {
        res.json(cached);
        return;
      }
      respondUpstreamError(res, err);
    }
  });

  router.post('/polestar-catalog/refresh', async (_req, res) => {
    try {
      const data = await fetchLiveAndCache();
      res.json(data);
    } catch (err) {
      respondUpstreamError(res, err);
    }
  });

  return router;
}

async function fetchLiveAndCache(): Promise<PolestarCatalogEntry[]> {
  const data = await fetchPolestarCatalog();
  writePolestarCatalogCache(data);
  return data;
}

function respondUpstreamError(res: Response, err: unknown): void {
  if (err instanceof UpstreamError) {
    res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
    return;
  }
  res.status(502).json({ error: 'Unexpected error fetching polestar catalog', code: 'UPSTREAM_ERROR' });
}
