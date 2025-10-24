import express, { Router } from 'express';

import { Pool } from 'pg';

import config from './config/config';
import { mountLegacyOrientationServer } from './legacy/orientation_server';

const app = express();

const db = new Pool({ connectionString: config.db.url });

mountLegacyOrientationServer(app, db);


app.get('/healthz', (_req, res) => {
  res.json({ ok: true, env: config.env });
});

const apiRouter = Router();
app.use('/api', apiRouter);

export { app, db };

