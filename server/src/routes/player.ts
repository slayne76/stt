import { Router, type Response } from 'express';
import type { AppConfig } from '../config';
import { fetchPlayerData } from '../sttClient';
import { loginAndGetSessionCookie } from '../authClient';
import { readPlayerCache, writePlayerCache } from '../cache';
import { readSessionCookie, writeSessionCookie } from '../sessionCache';
import { UpstreamAuthError, UpstreamError } from '../errors';
import { computeCitationPriorities } from '../citation/computeCitationPriorities';

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

  if (!config.sttEmail || !config.sttPassword) {
    throw new UpstreamAuthError(
      'Automatic STT login failed: STT_EMAIL and STT_PASSWORD are not set in server/.env.'
    );
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
    // Fire-and-forget: writing a new player cache invalidates the citation
    // priorities, and recomputing them is a ~12-13s synchronous, event-loop-blocking
    // job. Kicking it off here moves that cost to just after a sync — where the
    // user is already waiting on a refresh — instead of deferring it to whoever
    // opens the Overview page next. Deliberately not awaited (the player
    // response is already sent) and deliberately swallowed on failure: a
    // citation-priorities error must never affect the player-data request, and
    // GET /api/citation-priorities will surface it properly on its own. The
    // single-flight guard inside computeCitationPriorities() means a concurrent
    // request joins this run rather than starting a second one.
    void computeCitationPriorities().catch(() => {});
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
