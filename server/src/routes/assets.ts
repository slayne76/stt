import { Router } from 'express';
import { getCachedAssetPath, isKnownMissing, writeAssetCache, markAssetMissing, clearAssetCache } from '../assetCache';
import { fetchAsset } from '../assetClient';
import { UpstreamError } from '../errors';

const FILENAME_PATTERN = /^[A-Za-z0-9_-]+\.png$/;

export function createAssetsRouter(): Router {
  const router = Router();

  router.get('/assets/:filename', async (req, res) => {
    const { filename } = req.params;
    if (!FILENAME_PATTERN.test(filename)) {
      res.status(400).json({ error: 'Invalid asset filename' });
      return;
    }

    const cachedPath = getCachedAssetPath(filename);
    if (cachedPath !== null) {
      res.type('image/png').sendFile(cachedPath, { root: process.cwd() }, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: 'Asset not found' });
        }
      });
      return;
    }

    if (isKnownMissing(filename)) {
      res.status(404).json({ error: 'Asset not found (cached)' });
      return;
    }

    try {
      const data = await fetchAsset(filename);
      if (data === null) {
        markAssetMissing(filename);
        res.status(404).json({ error: 'Asset not found' });
        return;
      }
      writeAssetCache(filename, data);
      res.type('image/png').send(data);
    } catch (err) {
      if (err instanceof UpstreamError) {
        res.status(502).json({ error: err.message, code: 'UPSTREAM_ERROR' });
        return;
      }
      res.status(502).json({ error: 'Unexpected error fetching asset', code: 'UPSTREAM_ERROR' });
    }
  });

  router.post('/assets/refresh', (_req, res) => {
    clearAssetCache();
    res.json({ status: 'ok' });
  });

  return router;
}
