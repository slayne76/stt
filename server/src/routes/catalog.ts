import { Router, type Response } from 'express';
import { fetchCrewCatalog } from '../catalogClient';
import { readCatalogCache, writeCatalogCache } from '../catalogCache';
import { UpstreamError } from '../errors';

export function createCatalogRouter(): Router {
  const router = Router();

  router.get('/crew-catalog', async (_req, res) => {
    const cached = readCatalogCache();
    if (cached !== null) {
      res.json(cached);
      return;
    }
    await refreshAndRespond(res);
  });

  router.post('/crew-catalog/refresh', async (_req, res) => {
    await refreshAndRespond(res);
  });

  return router;
}

async function refreshAndRespond(res: Response): Promise<void> {
  try {
    const data = await fetchCrewCatalog();
    writeCatalogCache(data);
    res.json(data);
  } catch (err) {
    if (err instanceof UpstreamError) {
      res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
      return;
    }
    res.status(502).json({ error: 'Unexpected error fetching crew catalog', code: 'UPSTREAM_ERROR' });
  }
}
