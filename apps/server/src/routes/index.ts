import { Router } from 'express';
import type { Pool } from 'pg';

import { buildLegacyAuthRouter } from './auth.router';

export const buildApiRouter = (db: Pool) => {
  const router = Router();
  router.use('/auth', buildLegacyAuthRouter(db));
  return router;
};
