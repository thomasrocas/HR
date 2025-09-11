// orientation_server.js  (merged: auth + sessions + secure tasks)
// Requires: npm i express cors path pg express-session connect-pg-simple passport passport-google-oauth20 bcrypt
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');

// ==== 1) Postgres config ====
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '@DbAdmin@',
  database: process.env.PGDATABASE || 'orientation'
});

// ==== 2) App + middleware ====
const app = express();

// Behind proxies / WebViewer? Trust the first proxy so secure cookies & IPs work properly
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ==== 3) Static website ====
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'orientation_index.html'));
});

// ==== 4) Sessions (stored in Postgres) + Passport ====
// Use env override so local HTTP works but prod can require HTTPS.
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true';
app.use(session({
  store: new PgStore({ pool, tableName: 'session' }), // table created by connect-pg-simple if missing
  secret: process.env.SESSION_SECRET || 'dev-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('select * from public.users where id=$1', [id]);
    done(null, rows[0] || false);
  } catch (e) { done(e); }
});

// ---- Google Strategy ----
passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID || '80329949703-haj7aludbp14ma3fbg4h97rna0ngbn28.apps.googleusercontent.com',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'ZHhm_oFXdv7C9FELx-bSdsmt',
  callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3002/auth/google/callback'
}, async (_at, _rt, profile, done) => {
  try {
    const email   = profile.emails?.[0]?.value || null;
    const name    = profile.displayName || null;
    const picture = profile.photos?.[0]?.value || null;

    const upsert = `
      insert into public.users (google_id, email, full_name, picture_url, provider)
      values ($1,$2,$3,$4,'google')
      on conflict (google_id) do update
      set email=excluded.email, full_name=excluded.full_name, picture_url=excluded.picture_url, updated_at=now()
      returning *;`;
    const { rows } = await pool.query(upsert, [profile.id, email, name, picture]);
    return done(null, rows[0]);
  } catch (e) { return done(e); }
}));

// ---- Local username/password helpers ----
const SALT_ROUNDS = 12;
const validUsername = u => /^[a-zA-Z0-9._-]{3,32}$/.test(u || '');
const validPassword = p => typeof p === 'string' && p.length >= 8;

// If you haven’t run migrations yet, see SQL at bottom comment.

// ==== 5) Health check ====
app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});

// ==== 6) Auth routes ====
// Google SSO
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    // Ensure a preferences row so UI can restore state
    await pool.query(`
      insert into public.user_preferences (user_id, trainee)
      values ($1, $2)
      on conflict (user_id) do nothing;`,
      [req.user.id, req.user.full_name || '']);
    res.redirect('/');
  }
);

// Local: register
app.post('/auth/local/register', async (req, res) => {
  try {
    const { username, email, full_name, password } = req.body || {};
    if (!validUsername(username) || !validPassword(password)) {
      return res.status(400).json({ error: 'invalid_credentials' });
    }
    const exists = await pool.query('select 1 from public.users where username=$1 or email=$2 limit 1', [username, email || null]);
    if (exists.rowCount) return res.status(409).json({ error: 'already_exists' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows } = await pool.query(`
      insert into public.users (username, email, full_name, password_hash, provider)
      values ($1,$2,$3,$4,'local') returning *;`,
      [username, email || '', full_name || '', hash]);

    req.login(rows[0], (err) => {
      if (err) return res.status(500).json({ error: 'session_error' });
      res.json({ ok: true, user: { id: rows[0].id, username: rows[0].username } });
    });
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

// Local: login
app.post('/auth/local/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!validUsername(username) || !validPassword(password)) {
      return res.status(400).json({ error: 'invalid_credentials' });
    }
    const { rows } = await pool.query('select * from public.users where username=$1 limit 1', [username]);
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: 'bad_username_or_password' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'bad_username_or_password' });

    await pool.query('update public.users set last_login_at=now() where id=$1', [user.id]);
    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'session_error' });
      res.json({ ok: true, user: { id: user.id, username: user.username } });
    });
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

// Logout (works for both)
app.post('/auth/logout', (req, res) => {
  req.logout?.(() => {});
  req.session?.destroy(() => {});
  res.json({ ok: true });
});

// Me + Preferences
function ensureAuth(req, res, next){
  if (req.isAuthenticated?.()) return next();
  res.status(401).json({ error: 'auth_required' });
}

app.get('/me', ensureAuth, (req, res) => {
  res.json({ id: req.user.id, name: req.user.full_name, email: req.user.email, picture: req.user.picture_url });
});

app.get('/prefs', ensureAuth, async (req, res) => {
  const { rows } = await pool.query('select * from public.user_preferences where user_id=$1', [req.user.id]);
  res.json(rows[0] || {});
});
app.patch('/prefs', ensureAuth, async (req, res) => {
  const { program_id, start_date, num_weeks, trainee } = req.body || {};
  const up = `
    insert into public.user_preferences (user_id, program_id, start_date, num_weeks, trainee, updated_at)
    values ($1,$2,$3,$4,$5, now())
    on conflict (user_id) do update
    set program_id=excluded.program_id,
        start_date=excluded.start_date,
        num_weeks=excluded.num_weeks,
        trainee=excluded.trainee,
        updated_at=now()
    returning *;`;
  const { rows } = await pool.query(up, [req.user.id, program_id, start_date, num_weeks, trainee]);
  res.json(rows[0]);
});

// ==== 7) API: tasks (per-user) ====
// Expect public.orientation_tasks to include: user_id uuid references users(id)
// If you haven’t added user_id yet, run the migration described in comments below.

app.get('/tasks', ensureAuth, async (req, res) => {
  try {
    const { start, end, program_id } = req.query;
    const conds = ['user_id = $1'];
    const vals = [req.user.id];

    if (start) { vals.push(start); conds.push(`scheduled_for >= $${vals.length}`); }
    if (end)   { vals.push(end);   conds.push(`scheduled_for <= $${vals.length}`); }
    if (program_id) { vals.push(program_id); conds.push(`program_id = $${vals.length}`); }

    const where = `WHERE ${conds.join(' AND ')}`;
    const sql = `SELECT * FROM public.orientation_tasks ${where}
                 ORDER BY scheduled_for NULLS LAST, task_id`;
    const { rows } = await pool.query(sql, vals);
    res.json(rows);
  } catch (err) {
    console.error('GET /tasks error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/tasks', ensureAuth, async (req, res) => {
  try {
    const {
      label, scheduled_for = null,
      done = false, program_id = null, week_number = null, notes = null
    } = req.body;

    const sql = `
      INSERT INTO public.orientation_tasks
        (user_id, trainee, label, scheduled_for, done, program_id, week_number, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *;`;
    const trainee = req.user.full_name || ''; // optional label for UI
    const vals = [req.user.id, trainee, label, scheduled_for, !!done, program_id, week_number, notes];
    const { rows } = await pool.query(sql, vals);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /tasks error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/tasks/:id', ensureAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const fields = [];
    const vals = [];

    for (const key of ['label','scheduled_for','done','program_id','week_number','notes']) {
      if (key in req.body) {
        vals.push(key === 'done' ? !!req.body[key] : req.body[key]);
        fields.push(`${key} = $${vals.length}`);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    // Restrict update to this user’s row
    vals.push(req.user.id); // $N for user_id
    vals.push(id);          // $N+1 for task_id

    const sql = `UPDATE public.orientation_tasks
                 SET ${fields.join(', ')}
                 WHERE user_id = $${vals.length-1} AND task_id = $${vals.length}
                 RETURNING *;`;
    const { rows } = await pool.query(sql, vals);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /tasks/:id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/tasks/:id', ensureAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const q = `DELETE FROM public.orientation_tasks WHERE user_id = $1 AND task_id = $2`;
    const result = await pool.query(q, [req.user.id, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /tasks/:id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==== 8) Start server ====
const PORT = Number(process.env.PORT || 3002);
app.listen(PORT, () => {
  console.log(`Orientation site + API running at http://localhost:${PORT}`);
});

/*
======================
SQL MIGRATION (run once)
======================
-- Users
create extension if not exists pgcrypto; -- for gen_random_uuid()
do $$ begin
  if not exists (select 1 from pg_type where typname = 'auth_provider') then
    create type auth_provider as enum ('google','local');
  end if;
end $$;

create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  google_id    text unique,
  username     text unique,
  email        text,
  full_name    text,
  picture_url  text,
  password_hash text,
  provider     auth_provider default 'google',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  last_login_at timestamptz
);

-- Session table for connect-pg-simple (or let the package create it)
create table if not exists public.session (
  sid text primary key,
  sess jsonb not null,
  expire timestamp(6) not null
);
create index if not exists "IDX_session_expire" on public.session (expire);

-- Preferences (resume UI)
create table if not exists public.user_preferences (
  user_id    uuid primary key references public.users(id) on delete cascade,
  program_id text,
  start_date date,
  num_weeks  int,
  trainee    text,
  updated_at timestamptz default now()
);

-- Tasks: add user_id (owning user)
alter table public.orientation_tasks
  add column if not exists user_id uuid references public.users(id);

-- Optional backfill for legacy rows (assign to first admin user)
-- update public.orientation_tasks set user_id = (select id from public.users order by created_at limit 1) where user_id is null;
*/
