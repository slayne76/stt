import { Router, type Response } from 'express';
import type { AppConfig } from '../config';
import { fetchPlayerData } from '../sttClient';
import { readPlayerCache, writePlayerCache } from '../cache';
import { UpstreamAuthError, UpstreamError } from '../errors';

export function createPlayerRouter(config: AppConfig): Router {
  const router = Router();

  router.get('/player', async (_req, res) => {
    const cached = readPlayerCache();
    if (cached !== null) {
      res.json(cached);
      return;
    }
    await refreshAndRespond(config, res);
  });

  router.post('/player/refresh', async (_req, res) => {
    await refreshAndRespond(config, res);
  });

  return router;
}

async function refreshAndRespond(config: AppConfig, res: Response): Promise<void> {
  try {
    const data = await fetchPlayerData(config);
    writePlayerCache(data);
    res.json(data);
  } catch (err) {
    if (err instanceof UpstreamAuthError) {
      res.status(502).json({ error: err.message, code: 'UPSTREAM_AUTH_FAILED' });
      return;
    }
    if (err instanceof UpstreamError) {
      res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
      return;
    }
    res.status(502).json({ error: 'Unexpected error fetching player data', code: 'UPSTREAM_ERROR' });
  }
}
