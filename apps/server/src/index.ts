import express, { Router } from "express";
import cors from "cors";
import session from "express-session";
import { Pool } from "pg";

import config from "./config/config";

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: config.server.corsOrigin,
    credentials: true,
  })
);
app.use(
  session({
    secret: config.server.sessionSecret,
    resave: false,
    saveUninitialized: false,
  })
);

const db = new Pool({
  connectionString: config.db.url,
});

app.use("/api", Router());

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

export { app, db };
