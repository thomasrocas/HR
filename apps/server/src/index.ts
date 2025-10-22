import express from "express";
import { Pool } from "pg";

import config from "./config/config";
import { buildApiRouter } from "./routes";
import { mountLegacyOrientationServer } from "./legacy/orientation_server";
import { setLegacyAuthPool } from "./middlewares/_legacyAuth";

const app = express();

const db = new Pool({
  connectionString: config.db.url,
});

setLegacyAuthPool(db);

const legacy = mountLegacyOrientationServer(app, db);

app.use("/api", buildApiRouter(db));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, env: config.env });
});

const server = app.listen(config.server.port, () => {
  const address = server.address();
  if (address && typeof address !== "string") {
    console.log(`Server listening on port ${address.port}`);
  } else {
    console.log(`Server listening on port ${config.server.port}`);
  }
});

export { app, db, legacy };
