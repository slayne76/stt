import { Router, type Response } from 'express';
import { fetchCrewCatalog, type CatalogEntry } from '../catalogClient';
import { readCatalogCache, writeCatalogCache, isCatalogCacheFresh } from '../catalogCache';
import { UpstreamError } from '../errors';

export function createCatalogRouter(): Router {
  const router = Router();

  router.get('/crew-catalog', async (_req, res) => {
    const cached = readCatalogCache();
    if (cached !== null && isCatalogCacheFresh()) {
      res.json(cached);
      return;
    }
    try {
      const data = await fetchLiveAndCache();
      res.json(data);
    } catch (err) {
      if (cached !== null) {
        // Background refresh failed but a (stale) cache exists — serve it rather
        // than degrading a previously-working page. POST /refresh (an explicit
        // user action) does NOT get this fallback; see below.
        res.json(cached);
        return;
      }
      respondUpstreamError(res, err);
    }
  });

  router.post('/crew-catalog/refresh', async (_req, res) => {
    try {
      const data = await fetchLiveAndCache();
      res.json(data);
    } catch (err) {
      respondUpstreamError(res, err);
    }
  });

  return router;
}

async function fetchLiveAndCache(): Promise<CatalogEntry[]> {
  const data = await fetchCrewCatalog();
  writeCatalogCache(data);
  return data;
}

function respondUpstreamError(res: Response, err: unknown): void {
  if (err instanceof UpstreamError) {
    res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
    return;
  }
  res.status(502).json({ error: 'Unexpected error fetching crew catalog', code: 'UPSTREAM_ERROR' });
}
