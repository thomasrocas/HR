import type { Request, Response } from "express";
import type { Pool } from "pg";

const bcrypt = require("bcrypt");

const SALT_ROUNDS = 12;

let pool: Pool | undefined;

export function setLegacyAuthPool(db: Pool) {
  pool = db;
}

function validUsername(u: unknown) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test((u as string) || "");
}

function validPassword(p: unknown) {
  return typeof p === "string" && p.length >= 8;
}

export async function registerLocal(req: Request, res: Response) {
  const db = pool as Pool;
  const { username, email, full_name, password } = req.body || {};
  if (!validUsername(username) || !validPassword(password)) {
    return res.status(400).json({ error: "invalid_credentials" });
  }

  const exists = await db.query(
    "select 1 from public.users where username=$1 or email=$2 limit 1",
    [username, email || null]
  );
  if (exists.rowCount) {
    return res.status(409).json({ error: "already_exists" });
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const upsert = `
    insert into public.users (username, email, full_name, password_hash, provider)
    values ($1,$2,$3,$4,'local')
    returning *;`;
  const { rows } = await db.query(upsert, [username, email || "", full_name || "", hash]);

  req.login(rows[0], (err: unknown) => {
    if (err) {
      res.status(500).json({ error: "session_error" });
      return;
    }
    res.json({ ok: true, user: { id: rows[0].id, username: rows[0].username } });
  });
}

export async function loginLocal(req: Request, res: Response) {
  const db = pool as Pool;
  const { username, password } = req.body || {};
  if (!validUsername(username) || !validPassword(password)) {
    return res.status(400).json({ error: "invalid_credentials" });
  }

  const { rows } = await db.query("select * from public.users where username=$1 limit 1", [username]);
  const user = rows[0];
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: "bad_username_or_password" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "bad_username_or_password" });
  }

  await db.query("update public.users set last_login_at=now() where id=$1", [user.id]);

  req.login(user, (err: unknown) => {
    if (err) {
      res.status(500).json({ error: "session_error" });
      return;
    }
    res.json({ ok: true, user: { id: user.id, username: user.username } });
  });
}

export function logout(req: Request, res: Response) {
  req.logout?.(() => {});
  req.session?.destroy(() => {});
  res.json({ ok: true });
}

export default {
  registerLocal,
  loginLocal,
  logout,
  setLegacyAuthPool,
};
