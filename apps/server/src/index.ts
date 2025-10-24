import express, { Router } from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';

import config from './config/config';

const app = express();
const PgStore = connectPgSimple(session);

const corsOrigins = config.server.corsOrigin;
const corsOptions = corsOrigins.length > 0
  ? { origin: corsOrigins, credentials: true }
  : { origin: true, credentials: true };

app.use(express.json());
app.use(cors(corsOptions));

const db = new Pool({ connectionString: config.db.url });

const cookieSecure = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true';

app.use(session({
  store: new PgStore({ pool: db, tableName: 'session' }),
  secret: config.server.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
}));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, env: config.env });
});

const apiRouter = Router();
app.use('/api', apiRouter);

export { app, db };

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
