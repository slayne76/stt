import { Router, type Response } from 'express';
import { fetchShipCatalog, type ShipCatalogEntry } from '../shipCatalogClient';
import { readShipCatalogCache, writeShipCatalogCache, isShipCatalogCacheFresh } from '../shipCatalogCache';
import { UpstreamError } from '../errors';

export function createShipCatalogRouter(): Router {
  const router = Router();

  router.get('/ship-catalog', async (_req, res) => {
    const cached = readShipCatalogCache();
    if (cached !== null && isShipCatalogCacheFresh()) {
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

  router.post('/ship-catalog/refresh', async (_req, res) => {
    try {
      const data = await fetchLiveAndCache();
      res.json(data);
    } catch (err) {
      respondUpstreamError(res, err);
    }
  });

  return router;
}

async function fetchLiveAndCache(): Promise<ShipCatalogEntry[]> {
  const data = await fetchShipCatalog();
  writeShipCatalogCache(data);
  return data;
}

function respondUpstreamError(res: Response, err: unknown): void {
  if (err instanceof UpstreamError) {
    res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
    return;
  }
  res.status(502).json({ error: 'Unexpected error fetching ship catalog', code: 'UPSTREAM_ERROR' });
}
