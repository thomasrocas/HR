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
const crypto = require('crypto');
let transporter;
try {
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport(process.env.SMTP_URL || { jsonTransport: true });
} catch (err) {
  console.warn('nodemailer not installed, using console transport');
  transporter = {
    sendMail: async opts => {
      console.log('Mock sendMail', opts);
      return Promise.resolve();
    }
  };
}

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

// Populate roles/permissions and set current_user for auditing
app.use(async (req, _res, next) => {
  try {
    if (req.user?.id) {
      const { rows: roleRows } = await pool.query(
        'select role_key from user_roles where user_id = $1',
        [req.user.id]
      );
      req.roles = roleRows.map(r => r.role_key);
      if (req.roles.length) {
        const { rows: permRows } = await pool.query(
          'select distinct perm_key from role_permissions where role_key = any($1)',
          [req.roles]
        );
        req.perms = new Set(permRows.map(p => p.perm_key));
      } else {
        req.perms = new Set();
      }
      try {
        await pool.query('SET LOCAL app.current_user = $1', [req.user.id]);
      } catch (_e) {
        /* ignore */
      }
    } else {
      req.roles = [];
      req.perms = new Set();
    }
    next();
  } catch (_err) {
    req.roles = [];
    req.perms = new Set();
    next();
  }
});

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
const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');

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

// Change password
app.post('/auth/local/change-password', ensureAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!validPassword(current_password) || !validPassword(new_password)) {
      return res.status(400).json({ error: 'invalid_credentials' });
    }
    const { rows } = await pool.query('select password_hash from public.users where id=$1', [req.user.id]);
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(400).json({ error: 'no_password_set' });
    const ok = await bcrypt.compare(current_password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'bad_password' });
    const hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await pool.query('update public.users set password_hash=$1, updated_at=now() where id=$2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

// Request password reset
app.post('/auth/local/forgot', async (req, res) => {
  const { identifier } = req.body || {};
  try {
    if (identifier) {
      const { rows } = await pool.query(
        'select id, email from public.users where username=$1 or email=$1 limit 1',
        [identifier]
      );
      const user = rows[0];
      if (user && user.email) {
        const token = crypto.randomBytes(32).toString('hex');
        const hashed = crypto.createHash('sha256').update(token).digest('hex');
        const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
        await pool.query(
          'update public.users set password_reset_token=$1, password_reset_expires=$2, updated_at=now() where id=$3',
          [hashed, expires, user.id]
        );
        const resetLink = `${process.env.PUBLIC_URL || 'http://localhost:3002'}/reset.html?token=${token}`;
        await transporter.sendMail({
          to: user.email,
          subject: 'Password Reset',
          text: `Reset your password: ${resetLink}`
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: true });
  }
});

// Apply password reset
app.post('/auth/local/reset', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !validPassword(password)) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      'select id, password_reset_expires from public.users where password_reset_token=$1',
      [hashed]
    );
    const user = rows[0];
    if (!user || !user.password_reset_expires || user.password_reset_expires < new Date()) {
      return res.status(400).json({ error: 'invalid_or_expired' });
    }
    const newHash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query(
      'update public.users set password_hash=$1, password_reset_token=null, password_reset_expires=null, updated_at=now() where id=$2',
      [newHash, user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

// Logout (works for both)
app.post('/auth/logout', (req, res, next) => {
  if (!req.session) return res.json({ ok: true });
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => res.json({ ok: true }));
  });
});

// Me + Preferences
function ensureAuth(req, res, next){
  if (req.isAuthenticated?.()) return next();
  res.status(401).json({ error: 'auth_required' });
}

function ensurePerm(...permKeys) {
  return (req, res, next) => {
    if (!req.isAuthenticated?.()) {
      return res.status(401).json({ error: 'auth_required' });
    }
    if (req.roles?.includes('admin')) return next();
    for (const key of permKeys) {
      if (req.perms?.has(key)) return next();
    }
    res.status(403).json({ error: 'forbidden' });
  };
}

async function userManagesProgram(userId, programId) {
  const { rowCount } = await pool.query(
    'select 1 from program_memberships where user_id = $1 and program_id = $2 and role = $3',
    [userId, programId, 'manager']
  );
  return rowCount > 0;
}

app.get('/me', ensureAuth, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.full_name,
    email: req.user.email,
    username: req.user.username,
    picture: req.user.picture_url
  });
});

app.patch('/me', ensureAuth, async (req, res) => {
  const { full_name, email, username } = req.body || {};
  if (username && !validUsername(username)) {
    return res.status(400).json({ error: 'invalid_username' });
  }
  if (email && !validEmail(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  try {
    if (username) {
      const u = await pool.query('select 1 from public.users where username=$1 and id<>$2', [username, req.user.id]);
      if (u.rowCount) return res.status(409).json({ error: 'already_exists' });
    }
    if (email) {
      const e = await pool.query('select 1 from public.users where email=$1 and id<>$2', [email, req.user.id]);
      if (e.rowCount) return res.status(409).json({ error: 'already_exists' });
    }
    const sql = `
      update public.users
      set username = coalesce($1, username),
          email    = coalesce($2, email),
          full_name= coalesce($3, full_name),
          updated_at = now()
      where id = $4
      returning id, username, email, full_name;`;
    const { rows } = await pool.query(sql, [username, email, full_name, req.user.id]);
    res.json({ id: rows[0].id, username: rows[0].username, email: rows[0].email, name: rows[0].full_name });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
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

// ==== 7) API: programs & templates ====

app.get('/programs', ensurePerm('program.read'), async (_req, res) => {
  try {
    const { rows } = await pool.query('select * from public.programs order by created_at desc');
    res.json(rows);
  } catch (err) {
    console.error('GET /programs error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/programs', ensurePerm('program.create'), async (req, res) => {
  try {
    const { program_id = crypto.randomUUID(), title, total_weeks = null, description = null } = req.body || {};
    const sql = `
      insert into public.programs (program_id, title, total_weeks, description, created_by)
      values ($1,$2,$3,$4,$5)
      returning *;`;
    const { rows } = await pool.query(sql, [program_id, title, total_weeks, description, req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /programs error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/programs/:program_id', ensurePerm('program.update'), async (req, res) => {
  try {
    const { program_id } = req.params;
    if (!req.roles.includes('admin')) {
      const ok = await userManagesProgram(req.user.id, program_id);
      if (!ok) return res.status(403).json({ error: 'forbidden' });
    }
    const fields = [];
    const vals = [];

    for (const key of ['title', 'total_weeks', 'description']) {
      if (key in req.body) {
        vals.push(req.body[key]);
        fields.push(`${key} = $${vals.length}`);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    vals.push(program_id); // for program_id
    const sql = `update public.programs set ${fields.join(', ')}
                 where program_id = $${vals.length}
                 returning *;`;
    const { rows } = await pool.query(sql, vals);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /programs/:program_id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/programs/:program_id', ensurePerm('program.delete'), async (req, res) => {
  try {
    const { program_id } = req.params;
    if (!req.roles.includes('admin')) {
      const ok = await userManagesProgram(req.user.id, program_id);
      if (!ok) return res.status(403).json({ error: 'forbidden' });
    }
    await pool.query('delete from public.program_task_templates where program_id=$1', [program_id]);
    const result = await pool.query('delete from public.programs where program_id=$1', [program_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /programs/:program_id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/programs/:program_id/templates', ensurePerm('template.read'), async (req, res) => {
  try {
    const { program_id } = req.params;
    const { rows } = await pool.query(
      'select * from public.program_task_templates where program_id=$1 order by week_number, sort_order, template_id',
      [program_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /programs/:id/templates error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/programs/:program_id/templates', ensurePerm('template.create'), async (req, res) => {
  try {
    const { program_id } = req.params;
    const { week_number = null, label, notes = null, sort_order = null } = req.body || {};
    const sql = `
      insert into public.program_task_templates (program_id, week_number, label, notes, sort_order)
      values ($1,$2,$3,$4,$5)
      returning *;`;
    const { rows } = await pool.query(sql, [program_id, week_number, label, notes, sort_order]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /programs/:id/templates error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/programs/:program_id/templates/:template_id', ensurePerm('template.update'), async (req, res) => {
  try {
    const { program_id, template_id } = req.params;
    if (!program_id || !template_id) return res.status(400).json({ error: 'Invalid id' });
    if (!req.roles.includes('admin')) {
      const ok = await userManagesProgram(req.user.id, program_id);
      if (!ok) return res.status(403).json({ error: 'forbidden' });
    }
    const fields = [];
    const vals = [];
    for (const key of ['week_number', 'label', 'notes', 'sort_order']) {
      if (key in req.body) {
        vals.push(req.body[key]);
        fields.push(`${key} = $${vals.length}`);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    vals.push(program_id);
    vals.push(template_id);
    const sql = `update public.program_task_templates
                 set ${fields.join(', ')}
                 where program_id = $${vals.length-1} and template_id = $${vals.length}
                 returning *;`;
    const { rows } = await pool.query(sql, vals);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /programs/:id/templates/:template_id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/programs/:program_id/templates/:template_id', ensurePerm('template.delete'), async (req, res) => {
  try {
    const { program_id, template_id } = req.params;
    if (!program_id || !template_id) return res.status(400).json({ error: 'Invalid id' });
    if (!req.roles.includes('admin')) {
      const ok = await userManagesProgram(req.user.id, program_id);
      if (!ok) return res.status(403).json({ error: 'forbidden' });
    }
    const result = await pool.query(
      'delete from public.program_task_templates where program_id=$1 and template_id=$2',
      [program_id, template_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /programs/:id/templates/:template_id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/programs/:program_id/instantiate', ensureAuth, async (req, res) => {
  try {
    const { program_id } = req.params;
    const trainee = req.user.full_name || '';
    const sql = `
      insert into public.orientation_tasks (user_id, trainee, label, scheduled_for, done, program_id, week_number, notes)
      select $1, $2, label, null, false, program_id, week_number, notes
      from public.program_task_templates
      where program_id=$3
      order by week_number, sort_order
      returning *;`;
    const { rows } = await pool.query(sql, [req.user.id, trainee, program_id]);
    res.json({ created: rows.length });
  } catch (err) {
    console.error('POST /programs/:id/instantiate error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==== 8) API: tasks (per-user) ====
// Expect public.orientation_tasks to include: user_id uuid references users(id)
// If you haven’t added user_id yet, run the migration described in comments below.

app.get('/tasks', ensureAuth, async (req, res) => {
  try {
    const { start, end, program_id, include_deleted } = req.query;
    const conds = ['user_id = $1'];
    const vals = [req.user.id];

    if (!(include_deleted === 'true' || include_deleted === '1')) {
      conds.push('deleted = false');
    }

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
    const q = `UPDATE public.orientation_tasks SET deleted=true WHERE user_id = $1 AND task_id = $2`;
    const result = await pool.query(q, [req.user.id, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /tasks/:id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/tasks/:id/restore', ensureAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const q = `UPDATE public.orientation_tasks SET deleted=false WHERE user_id = $1 AND task_id = $2 RETURNING *`;
    const { rows } = await pool.query(q, [req.user.id, id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /tasks/:id/restore error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==== 9) Start server ====
if (require.main === module) {
  const PORT = Number(process.env.PORT || 3002);
  app.listen(PORT, () => {
    console.log(`Orientation site + API running at http://localhost:${PORT}`);
  });
}

module.exports = { app, pool, ensurePerm, userManagesProgram };

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
  password_reset_token text,
  password_reset_expires timestamptz,
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

-- Programs and task templates
create table if not exists public.programs (
  program_id   text primary key,
  title        text not null,
  total_weeks  int,
  description  text,
  created_by   uuid references public.users(id),
  created_at   timestamptz default now()
);

create table if not exists public.program_task_templates (
  template_id uuid primary key default gen_random_uuid(),
  program_id  text references public.programs(program_id) on delete cascade,
  week_number int,
  label       text not null,
  notes       text,
  sort_order  int
);

-- Tasks: add user_id (owning user)
alter table public.orientation_tasks
  add column if not exists user_id uuid references public.users(id);

-- Soft delete flag for tasks
alter table public.orientation_tasks
  add column if not exists deleted boolean default false;

-- Optional backfill for legacy rows (assign to first admin user)
-- update public.orientation_tasks set user_id = (select id from public.users order by created_at limit 1) where user_id is null;
*/
