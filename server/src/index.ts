import express from 'express';
import { loadConfig } from './config';
import { createPlayerRouter } from './routes/player';
import { createAssetsRouter } from './routes/assets';

const PORT = 3001;

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createPlayerRouter(config));
app.use('/api', createAssetsRouter());

app.listen(PORT, () => {
  console.log(`STT tracker server listening on port ${PORT}`);
});
