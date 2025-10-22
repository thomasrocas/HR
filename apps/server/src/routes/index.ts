import { Router } from "express";
import { Pool } from "pg";

export function buildApiRouter(db: Pool) {
  const router = Router();

  // const usersRouter = createUsersRouter(db);
  // router.use('/users', usersRouter);

  return router;
}
