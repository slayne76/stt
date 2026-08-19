import express from 'express';
import { loadConfig } from './config';
import { createPlayerRouter } from './routes/player';
import { createAssetsRouter } from './routes/assets';
import { createCatalogRouter } from './routes/catalog';
import { createCitationPrioritiesRouter } from './routes/citationPriorities';
import { createDilemmasRouter } from './routes/dilemmas';
import { createShipCatalogRouter } from './routes/shipCatalog';
import { createPolestarCatalogRouter } from './routes/polestarCatalog';
import { createRetrievableCrewRouter } from './routes/retrievableCrew';

const PORT = 3001;

const config = loadConfig();
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createPlayerRouter(config));
app.use('/api', createAssetsRouter());
app.use('/api', createCatalogRouter());
app.use('/api', createCitationPrioritiesRouter());
app.use('/api', createDilemmasRouter());
app.use('/api', createShipCatalogRouter());
app.use('/api', createPolestarCatalogRouter());
app.use('/api', createRetrievableCrewRouter());

app.listen(PORT, '127.0.0.1', () => {
  console.log(`STT tracker server listening on http://127.0.0.1:${PORT}`);
});
