import express from 'express';
import { loadConfig } from './config';
import { createPlayerRouter } from './routes/player';

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createPlayerRouter(config));

app.listen(config.port, () => {
  console.log(`STT tracker server listening on port ${config.port}`);
});
