import express from 'express';
import { loadConfig } from './config';

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(config.port, () => {
  console.log(`STT tracker server listening on port ${config.port}`);
});
