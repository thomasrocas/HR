import express from 'express';
import { Pool } from 'pg';

import config from './config/config';
import { mountLegacyOrientationServer } from './legacy/orientation_server';
import { buildApiRouter } from './routes';

const app = express();

const db = new Pool({ connectionString: config.db.url });

mountLegacyOrientationServer(app, db);

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, env: config.env });
});

const apiRouter = buildApiRouter(db);
app.use('/api', apiRouter);

export { app, db };
