import { Router, type Response } from 'express';
import type { AppConfig } from '../config';
import { fetchPlayerData } from '../sttClient';
import { loginAndGetSessionCookie } from '../authClient';
import { readPlayerCache, writePlayerCache } from '../cache';
import { readSessionCookie, writeSessionCookie } from '../sessionCache';
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

async function getPlayerDataWithAutoLogin(config: AppConfig): Promise<unknown> {
  const cachedCookie = readSessionCookie();
  if (cachedCookie !== null) {
    try {
      return await fetchPlayerData(cachedCookie, config.sttClientApi);
    } catch (err) {
      if (!(err instanceof UpstreamAuthError)) {
        throw err;
      }
      // fall through to a fresh login below
    }
  }

  const freshCookie = await loginAndGetSessionCookie(config.sttEmail, config.sttPassword);
  writeSessionCookie(freshCookie);

  try {
    return await fetchPlayerData(freshCookie, config.sttClientApi);
  } catch (err) {
    if (err instanceof UpstreamAuthError) {
      throw new UpstreamAuthError(
        'Automatic STT login succeeded, but the STT player API still rejected the new session — check STT_CLIENT_API or report this as a bug.'
      );
    }
    throw err;
  }
}

async function refreshAndRespond(config: AppConfig, res: Response): Promise<void> {
  try {
    const data = await getPlayerDataWithAutoLogin(config);
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
