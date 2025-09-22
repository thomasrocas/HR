// orientation_server.js  (merged: auth + sessions + secure tasks)
// Requires: npm i express cors path pg express-session connect-pg-simple passport passport-google-oauth20 bcrypt
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { createTemplatesDao, TEMPLATE_STATUSES } = require('./db/templates');
const { createProgramTemplateLinksDao } = require('./db/programTemplateLinks');

const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidUuid = value => typeof value === 'string' && UUID_REGEX.test(value);
const isBlank = value => value === null || value === undefined || value === '';
const createValidationError = code => {
  const error = new Error(code);
  error.status = 400;
  error.code = code;
  return error;
};
const toNullableInteger = value => {
  if (isBlank(value)) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw createValidationError('invalid_number');
  return Math.trunc(numeric);
};
const sanitizeProgramTotalWeeks = value => {
  const parsed = toNullableInteger(value);
  if (parsed === null || Number.isNaN(parsed) || parsed < 1) {
    throw createValidationError('invalid_total_weeks');
  }
  return parsed;
};
const toNullableBoolean = value => {
  if (isBlank(value)) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 't', 'yes', 'y', '1', 'required'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', '0', 'optional'].includes(normalized)) return false;
  }
  throw createValidationError('invalid_boolean');
};
const toNullableString = value => {
  if (value === null || value === undefined) return null;
  const str = String(value);
  const trimmed = str.trim();
  return trimmed === '' ? null : trimmed;
};
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

const templatesDao = createTemplatesDao(pool);
const programTemplateLinksDao = createProgramTemplateLinksDao(pool);

// ==== 2) App + middleware ====
const app = express();
const apiRouter = express.Router();

// Behind proxies / WebViewer? Trust the first proxy so secure cookies & IPs work properly
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ==== 3) Static website ====
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
const SRC_DIR = path.join(__dirname, 'src');
app.use('/src', express.static(SRC_DIR));
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
  let lastQuery;
  try {
    if (req.user?.id) {
      lastQuery = `select r.role_key, r.role_id
         from user_roles ur
         join roles r on ur.role_id = r.role_id
         where ur.user_id = $1`;
      const { rows: roleRows } = await pool.query(lastQuery, [req.user.id]);
      req.roles = roleRows.map(r => r.role_key);
      const roleIds = roleRows.map(r => r.role_id);
      if (roleIds.length) {

        lastQuery = `select column_name from information_schema.columns
                      where table_name='role_permissions' and column_name='perm_key'`;
        const { rows: hasPermKey } = await pool.query(lastQuery);
        if (hasPermKey.length) {
          lastQuery = 'select perm_key from role_permissions where role_id = any($1::int[])';
          const { rows: permRows } = await pool.query(lastQuery, [roleIds]);
          req.perms = new Set(permRows.map(p => p.perm_key));
        } else {
          lastQuery = `select p.perm_key
                        from role_permissions rp
                        join permissions p on rp.perm_id = p.perm_id
                        where rp.role_id = any($1::int[])`;
          const { rows: permRows } = await pool.query(lastQuery, [roleIds]);
          req.perms = new Set(permRows.map(p => p.perm_key));
        }

      } else {
        req.perms = new Set();
      }
      try {
        lastQuery = 'SET LOCAL app.current_user = $1';
        await pool.query(lastQuery, [req.user.id]);
      } catch (_e) {
        /* ignore */
      }
    } else {
      req.roles = [];
      req.perms = new Set();
    }
    next();
  } catch (err) {
    console.error('Failed to load roles/permissions', {
      userId: req.user?.id,
      query: lastQuery,
      error: err
    });
    req.roles = [];
    req.perms = new Set();
    next();
  }
});

app.use('/api', apiRouter);

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
    // Ensure a default role for SSO users (idempotent)
    try {
      await pool.query(
        `insert into public.user_roles(user_id, role_id)
         select $1, role_id from roles where role_key = $2
         on conflict do nothing`,
        [rows[0].id, process.env.DEFAULT_ROLE || 'viewer']
      );
    } catch (_e) { /* ignore role seeding errors */ }
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
      [req.user.id, req.user.id]);
    if (req.session && req.user?.id) {
      req.session.trainee = req.user.id;
    }
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

    await pool.query(
      'insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2',
      [rows[0].id, process.env.DEFAULT_ROLE || 'trainee']
    );

    // Ensure a preferences row so UI can restore program on login
    try {
      await pool.query(`
        insert into public.user_preferences (user_id, trainee)
        values ($1, $2)
        on conflict (user_id) do nothing;
      `, [rows[0].id, rows[0].id]);
    } catch (_e) {
      // ignore if preferences table absent
    }

    req.login(rows[0], (err) => {
      if (err) return res.status(500).json({ error: 'session_error' });
      if (req.session && req.user?.id) {
        req.session.trainee = req.user.id;
      }
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

    // Ensure a preferences row so UI can restore program on login
    try {
      await pool.query(`
        insert into public.user_preferences (user_id, trainee)
        values ($1, $2)
        on conflict (user_id) do nothing;
      `, [user.id, user.id]);
    } catch (_e) {
      // ignore if preferences table is absent in tests
    }

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'session_error' });
      if (req.session && req.user?.id) {
        req.session.trainee = req.user.id;
      }
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
    if (req.session) {
      req.session.trainee = null;
    }
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
    // Admins are allowed through automatically
    if (req.roles?.includes('admin')) return next();
    for (const key of permKeys) {
      if (req.perms?.has(key)) return next();
    }
    res.status(403).json({ error: 'forbidden' });
  };
}

const parseBooleanParam = value => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return false;
};

const parseOptionalInteger = value => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const asNumber = Number(value);
    if (Number.isInteger(asNumber)) return asNumber;
  }
  return undefined;
};

const coerceNotes = value => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  return String(value);
};

const sanitizeLinkMetadata = (raw = {}) => {
  const sanitized = {};
  if (Object.prototype.hasOwnProperty.call(raw, 'week_number')) {
    sanitized.week_number = toNullableInteger(raw.week_number);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'sort_order')) {
    sanitized.sort_order = toNullableInteger(raw.sort_order);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'due_offset_days')) {
    sanitized.due_offset_days = toNullableInteger(raw.due_offset_days);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'required')) {
    sanitized.required = toNullableBoolean(raw.required);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'visibility')) {
    sanitized.visibility = toNullableString(raw.visibility);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'visible')) {
    sanitized.visible = toNullableBoolean(raw.visible);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'notes')) {
    const rawNotes = coerceNotes(raw.notes);
    if (rawNotes === null) {
      sanitized.notes = null;
    } else {
      const trimmed = rawNotes.trim();
      sanitized.notes = trimmed === '' ? null : rawNotes;
    }
  }
  return sanitized;
};

const buildLinkPayloadFromTemplate = (template = {}, overrides = {}, userId = null) => {
  const sanitizedOverrides = sanitizeLinkMetadata(overrides);
  const payload = { ...sanitizedOverrides };
  if (!Object.prototype.hasOwnProperty.call(payload, 'week_number')) {
    payload.week_number = template.week_number ?? null;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'sort_order')) {
    payload.sort_order = template.sort_order ?? null;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'due_offset_days')) {
    payload.due_offset_days = template.due_offset_days ?? null;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'required')) {
    payload.required = template.required ?? null;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'visibility')) {
    payload.visibility = template.visibility ?? null;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'visible')) {
    payload.visible = true;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'notes')) {
    payload.notes = template.notes ?? null;
  }
  if (userId) {
    if (!Object.prototype.hasOwnProperty.call(payload, 'created_by')) {
      payload.created_by = userId;
    }
    payload.updated_by = userId;
  }
  return payload;
};

const normalizeTemplateId = value => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return value.trim();
  return null;
};

const normalizeTemplateStatus = value => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return TEMPLATE_STATUSES.has(normalized) ? normalized : null;
};

function buildTemplateMetadataPatch(source) {
  const payload = source && typeof source === 'object' ? source : {};
  const patch = {};
  let hasField = false;

  const assign = (key, value) => {
    patch[key] = value;
    hasField = true;
  };

  if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
    assign('notes', toNullableString(payload.notes));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'due_offset_days')) {
    assign('due_offset_days', toNullableInteger(payload.due_offset_days));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'required')) {
    assign('required', toNullableBoolean(payload.required));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'visibility')) {
    assign('visibility', toNullableString(payload.visibility));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'sort_order')) {
    assign('sort_order', toNullableInteger(payload.sort_order));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'week_number')) {
    assign('week_number', toNullableInteger(payload.week_number));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'label')) {
    assign('label', toNullableString(payload.label));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'external_link')) {
    assign('external_link', toNullableString(payload.external_link));
  } else if (Object.prototype.hasOwnProperty.call(payload, 'hyperlink')) {
    assign('external_link', toNullableString(payload.hyperlink));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    const statusValue = payload.status;
    if (statusValue === null || statusValue === undefined || statusValue === '') {
      return { patch: {}, hasField: false, error: 'invalid_status' };
    }
    if (typeof statusValue !== 'string') {
      return { patch: {}, hasField: false, error: 'invalid_status' };
    }
    const normalizedStatus = normalizeTemplateStatus(statusValue);
    if (!normalizedStatus) {
      return { patch: {}, hasField: false, error: 'invalid_status' };
    }
    assign('status', normalizedStatus);
  }

  return { patch, hasField, error: null };
}

const createHttpError = (status, code) => {
  const error = new Error(code || 'error');
  error.status = status;
  error.code = code;
  return error;
};

async function withTransaction(req, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (req?.user?.id) {
      await client.query("select set_config('app.current_user', $1::text, true)", [req.user.id]);
    }
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackErr) {
      /* ignore rollback errors */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function ensureProgramManagementAccess(req, programId) {
  if (!programId) {
    throw createHttpError(400, 'invalid_program');
  }
  if (req.roles?.includes('admin')) {
    return true;
  }
  const manages = await userManagesProgram(req.user?.id, programId);
  if (!manages) {
    throw createHttpError(403, 'forbidden');
  }
  return true;
}

async function attachTemplateToProgram(req, programId, templateId) {
  return withTransaction(req, async client => {
    const { rowCount: programExists } = await client.query(
      'select 1 from public.programs where program_id = $1 limit 1',
      [programId]
    );
    if (!programExists) {
      throw createHttpError(404, 'program_not_found');
    }
    const foundTemplate = await templatesDao.getById({ id: templateId, includeDeleted: false, db: client });
    if (!foundTemplate) {
      throw createHttpError(404, 'template_not_found');
    }
    const attachResult = await programTemplateLinksDao.attach({
      programId,
      templateId,
      db: client,
    });
    return { template: foundTemplate, attachResult };
  });
}

async function detachTemplateFromProgram(req, programId, templateId) {
  return withTransaction(req, async client => {
    const { rowCount: programExists } = await client.query(
      'select 1 from public.programs where program_id = $1 limit 1',
      [programId]
    );
    if (!programExists) {
      throw createHttpError(404, 'program_not_found');
    }
    const template = await templatesDao.getById({ id: templateId, includeDeleted: true, db: client });
    if (!template) {
      throw createHttpError(404, 'template_not_found');
    }
    const detachResult = await programTemplateLinksDao.detach({
      programId,
      templateId,
      db: client,
    });
    return { template, detachResult };
  });
}

async function updateProgramTemplateMetadata(req, programId, templateId, patch) {
  return withTransaction(req, async client => {
    const { rowCount: programExists } = await client.query(
      'select 1 from public.programs where program_id = $1 limit 1',
      [programId]
    );
    if (!programExists) {
      throw createHttpError(404, 'program_not_found');
    }
    const updateResult = await programTemplateLinksDao.updateMetadata({
      programId,
      templateId,
      patch,
      db: client,
    });
    if (!updateResult.updated) {
      throw createHttpError(404, 'template_not_found');
    }
    return updateResult;
  });
}

apiRouter.get('/templates', ensurePerm('template.read'), async (req, res) => {
  try {
    const includeDeleted = parseBooleanParam(req.query?.include_deleted);
    const rawStatus = req.query?.status;
    let status;
    if (rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== '') {
      const normalizedStatus = normalizeTemplateStatus(String(rawStatus));
      if (!normalizedStatus) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      status = normalizedStatus;
    }
    const result = await templatesDao.list({
      includeDeleted,
      limit: req.query?.limit,
      offset: req.query?.offset,
      status,
      search: typeof req.query?.search === 'string' ? req.query.search : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('GET /api/templates error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.post('/templates', ensurePerm('template.create'), async (req, res) => {
  try {
    const body = req.body || {};
    const rawLabel = typeof body.label === 'string' ? body.label.trim() : '';
    if (!rawLabel) {
      return res.status(400).json({ error: 'invalid_label' });
    }
    const weekNumber = parseOptionalInteger(body.week_number);
    if (weekNumber === undefined) {
      return res.status(400).json({ error: 'invalid_week_number' });
    }
    const sortOrder = parseOptionalInteger(body.sort_order);
    if (sortOrder === undefined) {
      return res.status(400).json({ error: 'invalid_sort_order' });
    }
    let status = 'draft';
    if (body.status !== undefined) {
      const normalizedStatus = normalizeTemplateStatus(String(body.status));
      if (!normalizedStatus) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      status = normalizedStatus;
    }
    const organizationValue = toNullableString(body.organization ?? body.org ?? null);
    let subUnitRaw = null;
    if (Object.prototype.hasOwnProperty.call(body, 'sub_unit')) {
      subUnitRaw = body.sub_unit;
    } else if (Object.prototype.hasOwnProperty.call(body, 'subUnit')) {
      subUnitRaw = body.subUnit;
    }
    const subUnitValue = toNullableString(subUnitRaw);
    let externalLinkRaw = null;
    if (Object.prototype.hasOwnProperty.call(body, 'external_link')) {
      externalLinkRaw = body.external_link;
    } else if (Object.prototype.hasOwnProperty.call(body, 'externalLink')) {
      externalLinkRaw = body.externalLink;
    } else if (Object.prototype.hasOwnProperty.call(body, 'hyperlink')) {
      externalLinkRaw = body.hyperlink;
    }
    const externalLinkValue = toNullableString(externalLinkRaw);
    const template = await templatesDao.create({
      week_number: weekNumber,
      label: rawLabel,
      notes: coerceNotes(body.notes),
      sort_order: sortOrder,
      status,
      organization: organizationValue,
      sub_unit: subUnitValue,
      external_link: externalLinkValue,
    });
    res.status(201).json(template);
  } catch (err) {
    console.error('POST /api/templates error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.get('/templates/:templateId', ensurePerm('template.read'), async (req, res) => {
  try {
    const templateId = normalizeTemplateId(req.params.templateId);
    if (templateId === null) {
      return res.status(400).json({ error: 'invalid_template_id' });
    }
    const includeDeleted = parseBooleanParam(req.query?.include_deleted);
    const template = await templatesDao.getById({ id: templateId, includeDeleted });
    if (!template) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json(template);
  } catch (err) {
    console.error('GET /api/templates/:id error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.patch('/templates/:templateId', ensurePerm('template.update'), async (req, res) => {
  try {
    const templateId = normalizeTemplateId(req.params.templateId);
    if (templateId === null) {
      return res.status(400).json({ error: 'invalid_template_id' });
    }
    const existing = await templatesDao.getById({ id: templateId, includeDeleted: true });
    if (!existing) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (existing.deleted_at) {
      return res.status(404).json({ error: 'not_found' });
    }
    const body = req.body || {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body, 'label')) {
      const label = typeof body.label === 'string' ? body.label.trim() : '';
      if (!label) {
        return res.status(400).json({ error: 'invalid_label' });
      }
      patch.label = label;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'week_number')) {
      const weekNumber = parseOptionalInteger(body.week_number);
      if (weekNumber === undefined) {
        return res.status(400).json({ error: 'invalid_week_number' });
      }
      patch.week_number = weekNumber;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
      patch.notes = coerceNotes(body.notes);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'organization')) {
      patch.organization = toNullableString(body.organization);
    } else if (Object.prototype.hasOwnProperty.call(body, 'org')) {
      patch.organization = toNullableString(body.org);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'sub_unit')) {
      patch.sub_unit = toNullableString(body.sub_unit);
    } else if (Object.prototype.hasOwnProperty.call(body, 'subUnit')) {
      patch.sub_unit = toNullableString(body.subUnit);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'sort_order')) {
      const sortOrder = parseOptionalInteger(body.sort_order);
      if (sortOrder === undefined) {
        return res.status(400).json({ error: 'invalid_sort_order' });
      }
      patch.sort_order = sortOrder;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'external_link')) {
      patch.external_link = toNullableString(body.external_link);
    } else if (Object.prototype.hasOwnProperty.call(body, 'externalLink')) {
      patch.external_link = toNullableString(body.externalLink);
    } else if (Object.prototype.hasOwnProperty.call(body, 'hyperlink')) {
      patch.external_link = toNullableString(body.hyperlink);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      const normalizedStatus = normalizeTemplateStatus(String(body.status));
      if (!normalizedStatus) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      patch.status = normalizedStatus;
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'no_fields' });
    }
    const updated = await templatesDao.update({ id: templateId, patch });
    if (!updated) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json(updated);
  } catch (err) {
    console.error('PATCH /api/templates/:id error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.delete('/templates/:templateId', ensurePerm('template.delete'), async (req, res) => {
  try {
    const templateId = normalizeTemplateId(req.params.templateId);
    if (templateId === null) {
      return res.status(400).json({ error: 'invalid_template_id' });
    }
    const deleted = await templatesDao.softDelete({ id: templateId });
    if (!deleted) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/templates/:id error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.post('/templates/:templateId/restore', ensurePerm('template.delete'), async (req, res) => {
  try {
    const templateId = normalizeTemplateId(req.params.templateId);
    if (templateId === null) {
      return res.status(400).json({ error: 'invalid_template_id' });
    }
    const restored = await templatesDao.restore({ id: templateId });
    if (!restored) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ restored: true });
  } catch (err) {
    console.error('POST /api/templates/:id/restore error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.get('/templates/:templateId/programs', ensurePerm('template.read'), async (req, res) => {
  try {
    const templateId = normalizeTemplateId(req.params.templateId);
    if (templateId === null) {
      return res.status(400).json({ error: 'invalid_template_id' });
    }
    const result = await programTemplateLinksDao.listProgramsForTemplate({
      templateId,
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    res.json(result);
  } catch (err) {
    console.error('GET /api/templates/:id/programs error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.get('/programs/:programId/templates', ensurePerm('template.read'), async (req, res) => {
  try {
    const { programId } = req.params;
    if (!programId) {
      return res.status(400).json({ error: 'invalid_program_id' });
    }
    const { rowCount: programExists } = await pool.query(
      'select 1 from public.programs where program_id = $1 limit 1',
      [programId]
    );
    if (!programExists) {
      return res.status(404).json({ error: 'program_not_found' });
    }
    const includeDeleted = parseBooleanParam(req.query?.include_deleted);
    const rawStatus = req.query?.status;
    let status;
    if (rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== '') {
      const normalizedStatus = normalizeTemplateStatus(String(rawStatus));
      if (!normalizedStatus) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      status = normalizedStatus;
    }
    const result = await programTemplateLinksDao.listTemplatesForProgram({
      programId,
      includeDeleted,
      limit: req.query?.limit,
      offset: req.query?.offset,
      status,
    });
    res.json(result);
  } catch (err) {
    console.error('GET /api/programs/:id/templates error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.post('/programs/:programId/templates', ensurePerm('template.update'), async (req, res) => {
  const { programId } = req.params;
  const templateId = normalizeTemplateId(req.body?.template_id ?? req.body?.templateId);
  if (!programId || templateId === null) {
    return res.status(400).json({ error: 'invalid_template_id' });
  }
  try {
    await ensureProgramManagementAccess(req, programId);
    const { template, attachResult } = await attachTemplateToProgram(req, programId, templateId);
    const statusCode = attachResult.alreadyAttached ? 200 : 201;
    res.status(statusCode).json({ attached: true, alreadyAttached: attachResult.alreadyAttached, template });
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ error: err.code || 'not_found' });
    }

    if (err?.status === 403) {
      return res.status(403).json({ error: 'forbidden' });
    }
    console.error('POST /api/programs/:id/templates error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.patch('/programs/:programId/templates/:templateId', ensurePerm('template.update'), async (req, res) => {
  const { programId, templateId: templateParam } = req.params;
  const templateId = normalizeTemplateId(templateParam);
  if (!programId || templateId === null) {
    return res.status(400).json({ error: 'invalid_template_id' });
  }
  const { patch, hasField, error } = buildTemplateMetadataPatch(req.body);
  if (error) {
    return res.status(400).json({ error });
  }
  if (!hasField) {
    return res.status(400).json({ error: 'no_fields' });
  }
  try {
    await ensureProgramManagementAccess(req, programId);
    const result = await updateProgramTemplateMetadata(req, programId, templateId, patch);
    res.json({ updated: result.updated, template: result.template });
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ error: err.code || 'not_found' });
    }
    if (err?.status === 403) {
      return res.status(403).json({ error: 'forbidden' });
    }
    console.error('PATCH /api/programs/:id/templates/:templateId error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.delete('/programs/:programId/templates/:templateId', ensurePerm('template.update'), async (req, res) => {
  const { programId, templateId: templateParam } = req.params;
  const templateId = normalizeTemplateId(templateParam);
  if (!programId || templateId === null) {
    return res.status(400).json({ error: 'invalid_template_id' });
  }
  try {
    await ensureProgramManagementAccess(req, programId);
    const result = await detachTemplateFromProgram(req, programId, templateId);
    res.json({ detached: true, wasAttached: result.detachResult.wasAttached });
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ error: err.code || 'not_found' });
    }
    if (err?.status === 403) {
      return res.status(403).json({ error: 'forbidden' });
    }
    console.error('DELETE /api/programs/:id/templates/:templateId error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.post('/programs/:programId/templates/attach', ensurePerm('template.update'), async (req, res) => {
  const { programId } = req.params;
  const templateId = normalizeTemplateId(req.body?.template_id ?? req.body?.templateId);
  if (!programId || templateId === null) {
    return res.status(400).json({ error: 'invalid_template_id' });
  }
  try {
    await ensureProgramManagementAccess(req, programId);
    const { template, attachResult } = await attachTemplateToProgram(req, programId, templateId);

    res.json({ attached: true, alreadyAttached: attachResult.alreadyAttached, template });
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ error: err.code || 'not_found' });
    }
    if (err?.status === 403) {
      return res.status(403).json({ error: 'forbidden' });
    }
    console.error('POST /api/programs/:id/templates/attach error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.post('/programs/:programId/templates/detach', ensurePerm('template.update'), async (req, res) => {
  const { programId } = req.params;
  const templateId = normalizeTemplateId(req.body?.template_id ?? req.body?.templateId);
  if (!programId || templateId === null) {
    return res.status(400).json({ error: 'invalid_template_id' });
  }
  try {
    await ensureProgramManagementAccess(req, programId);
    const result = await detachTemplateFromProgram(req, programId, templateId);
    res.json({ detached: true, wasAttached: result.detachResult.wasAttached });
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ error: err.code || 'not_found' });
    }
    if (err?.status === 403) {
      return res.status(403).json({ error: 'forbidden' });
    }
    console.error('POST /api/programs/:id/templates/detach error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

apiRouter.post('/programs/:programId/publish', ensurePerm('program.update'), async (req, res) => {
  try {
    const { programId } = req.params;
    if (!programId) {
      return res.status(400).json({ error: 'invalid_program_id' });
    }
    const { rowCount } = await pool.query(
      'select 1 from public.programs where program_id = $1 limit 1',
      [programId],
    );
    if (!rowCount) {
      return res.status(404).json({ error: 'program_not_found' });
    }
    res.json({ published: true });
  } catch (err) {
    console.error('POST /api/programs/:id/publish error', err);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/admin/user-manager', ensureAuth, (req, res) => {
  const roles = req.roles || [];
  if (!(roles.includes('admin') || roles.includes('manager'))) {
    return res.status(403).send('forbidden');
  }
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'user-manager.html'));
});

async function userManagesProgram(userId, programId) {
  if (!userId || !programId) return false;
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
    picture: req.user.picture_url,
    roles: req.roles,
    perms: Array.from(req.perms)
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
  const requestedUserId = req.query.user_id;
  if (requestedUserId !== undefined && !isValidUuid(requestedUserId)) {
    return res.status(400).json({ error: 'invalid_user_id' });
  }
  const userId = requestedUserId || req.user.id;
  const { rows: roleRows } = await pool.query(
    'select r.role_key from user_roles ur join roles r on ur.role_id=r.role_id where ur.user_id=$1',
    [userId]
  );
  const targetRoles = roleRows.map(r => r.role_key);
  if (targetRoles.includes('admin') && !req.roles.includes('admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { rows } = await pool.query('select * from public.user_preferences where user_id=$1', [userId]);
  const payload = rows[0] ? { ...rows[0] } : {};
  payload.session_trainee = req.session?.trainee ?? null;
  res.json(payload);
});
app.patch('/prefs', ensureAuth, async (req, res) => {
  const body = req.body || {};
  const {
    user_id: userId = req.user.id,
    program_id,
    start_date,
    num_weeks,
    trainee
  } = body;
  const { rows: roleRows } = await pool.query(
    'select r.role_key from user_roles ur join roles r on ur.role_id=r.role_id where ur.user_id=$1',
    [userId]
  );
  const targetRoles = roleRows.map(r => r.role_key);
  if (targetRoles.includes('admin') && !req.roles.includes('admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
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
  const { rows } = await pool.query(up, [userId, program_id, start_date, num_weeks, trainee]);
  if (req.session && Object.prototype.hasOwnProperty.call(body, 'trainee')) {
    req.session.trainee = trainee;
  }
  res.json(rows[0]);
});

// ==== 7) RBAC admin ====

app.get('/rbac/users', async (req, res) => {
  try {
    if (!(req.roles.includes('admin') || req.roles.includes('manager'))) return res.status(403).json({ error: 'forbidden' });
    const sql = `
      select u.id, u.full_name, u.username,
             coalesce(array_agg(r.role_key) filter (where r.role_key is not null), '{}') as roles
      from public.users u
      left join public.user_roles ur on ur.user_id = u.id
      left join roles r on r.role_id = ur.role_id
      group by u.id
      order by u.full_name`;
    const { rows } = await pool.query(sql);
    res.json(rows.map(r => ({ ...r, roles: r.roles || [] })));
  } catch (err) {
    console.error('GET /rbac/users error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/rbac/users/:id/roles', async (req, res) => {
  try {
    const isAdmin = req.roles.includes('admin');
    const isManager = req.roles.includes('manager');
    if (!(isAdmin || isManager)) return res.status(403).json({ error: 'forbidden' });

    const { id } = req.params;
    const { roles = [] } = req.body || {};
    if (!Array.isArray(roles)) return res.status(400).json({ error: 'invalid_roles' });

    if (isManager && !isAdmin) {
      // Managers are limited to non-privileged roles to prevent privilege escalation
      const allowedRoles = ['viewer', 'trainee'];
      const invalid = roles.filter(r => !allowedRoles.includes(r));
      if (invalid.length) return res.status(403).json({ error: 'forbidden' });
    }

    await pool.query('delete from public.user_roles where user_id=$1', [id]);
    for (const r of roles) {
      await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from roles where role_key = $2', [id, r]);
    }
    res.json({ updated: true });
  } catch (err) {
    console.error('PATCH /rbac/users/:id/roles error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==== 8) API: programs & templates ====

app.get('/programs', ensurePerm('program.read'), async (req, res) => {
  try {
    const includeDeleted = String(req.query?.include_deleted || '').toLowerCase() === 'true';
    const conds = [];
    if (!includeDeleted) conds.push('deleted_at is null');
    let sql = 'select * from public.programs';
    if (conds.length) sql += ` where ${conds.join(' and ')}`;
    sql += ' order by created_at desc';
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('GET /programs error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/programs', ensurePerm('program.create'), async (req, res) => {
  try {
    const { program_id = crypto.randomUUID(), title, total_weeks, description = null } = req.body || {};
    const sanitizedTotalWeeks = sanitizeProgramTotalWeeks(total_weeks);
    const sql = `
      insert into public.programs (program_id, title, total_weeks, description, created_by)
      values ($1,$2,$3,$4,$5)
      returning *;`;
    const { rows } = await pool.query(sql, [program_id, title, sanitizedTotalWeeks, description, req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.code || 'invalid_payload' });
    }
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
        if (key === 'total_weeks') {
          vals.push(sanitizeProgramTotalWeeks(req.body[key]));
        } else {
          vals.push(req.body[key]);
        }
        fields.push(`${key} = $${vals.length}`);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    vals.push(program_id); // for program_id
    const sql = `update public.programs set ${fields.join(', ')}
                 where program_id = $${vals.length} and deleted_at is null
                 returning *;`;
    const { rows } = await pool.query(sql, vals);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.code || 'invalid_payload' });
    }
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
    const result = await pool.query(
      `update public.programs
         set deleted_at = now()
       where program_id = $1 and deleted_at is null`,
      [program_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /programs/:program_id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/programs/:program_id/restore', ensurePerm('program.delete'), async (req, res) => {
  try {
    const { program_id } = req.params;
    if (!req.roles.includes('admin')) {
      const ok = await userManagesProgram(req.user.id, program_id);
      if (!ok) return res.status(403).json({ error: 'forbidden' });
    }
    const result = await pool.query(
      `update public.programs
         set deleted_at = null
       where program_id = $1 and deleted_at is not null
       returning *;`,
      [program_id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ restored: true });
  } catch (err) {
    console.error('POST /programs/:program_id/restore error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/programs/:program_id/templates', ensurePerm('template.read'), async (req, res) => {
  try {
    const { program_id } = req.params;
    const includeDeleted = String(req.query?.include_deleted || '').toLowerCase() === 'true';
    const sql = `select t.template_id,
                        l.program_id,
                        coalesce(l.week_number, t.week_number) as week_number,
                        t.label,
                        coalesce(l.notes, t.notes) as notes,
                        coalesce(l.due_offset_days, t.due_offset_days) as due_offset_days,
                        coalesce(l.required, t.required) as required,
                        coalesce(l.visibility, t.visibility) as visibility,
                        l.visible,
                        coalesce(l.sort_order, t.sort_order) as sort_order,
                        t.status,
                        t.deleted_at,
                        l.id as link_id,
                        l.created_at,
                        l.updated_at,
                        l.created_by,
                        l.updated_by
                 from public.program_task_templates t
                 join public.program_template_links l
                   on l.template_id = t.template_id
                 where l.program_id = $1${includeDeleted ? '' : ' and t.deleted_at is null'}
                 order by coalesce(l.week_number, t.week_number), coalesce(l.sort_order, t.sort_order), t.template_id`;
    const { rows } = await pool.query(sql, [program_id]);
    res.json(rows);
  } catch (err) {
    console.error('GET /programs/:id/templates error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/programs/:program_id/templates', ensurePerm('template.create'), async (req, res) => {
  try {
    const { program_id } = req.params;
    const {
      week_number = null,
      label,
      notes = null,
      due_offset_days = null,
      required = null,
      visibility = null,
      sort_order = null,
      visible = null,
    } = req.body || {};
    const sanitizedWeek = toNullableInteger(week_number);
    const sanitizedDueOffset = toNullableInteger(due_offset_days);
    const sanitizedRequired = toNullableBoolean(required);
    const sanitizedVisibility = toNullableString(visibility);
    const sanitizedSortOrder = toNullableInteger(sort_order);
    const sanitizedNotes = notes === null ? null : toNullableString(notes);
    const sanitizedLabel = label === null || label === undefined ? null : toNullableString(label);
    const sanitizedVisible = toNullableBoolean(visible);
    let status = null;
    if (typeof req.body?.status === 'string') {
      const normalized = req.body.status.toLowerCase();
      if (!TEMPLATE_STATUSES.has(normalized)) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      status = normalized;
    }
    const sql = `
      with inserted as (
        insert into public.program_task_templates (week_number, label, notes, due_offset_days, required, visibility, sort_order, status)
        values ($1,$2,$3,$4,$5,$6,$7,$8)
        returning template_id, week_number, label, notes, due_offset_days, required, visibility, sort_order, status, deleted_at
      ), linked as (
        insert into public.program_template_links (
          template_id,
          program_id,
          week_number,
          sort_order,
          due_offset_days,
          required,
          visibility,
          visible,
          notes,
          created_by,
          updated_by
        )
        select template_id,
               $9,
               week_number,
               sort_order,
               due_offset_days,
               required,
               visibility,
               coalesce($10, true),
               notes,
               $11,
               $11
          from inserted
        returning id as link_id,
                  template_id,
                  program_id,
                  week_number,
                  sort_order,
                  due_offset_days,
                  required,
                  visibility,
                  visible,
                  notes,
                  created_by,
                  updated_by,
                  created_at,
                  updated_at
      )
      select i.template_id,
             l.program_id,
             l.week_number,
             i.label,
             l.notes,
             l.due_offset_days,
             l.required,
             l.visibility,
             l.visible,
             l.sort_order,
             i.status,
             i.deleted_at,
             l.link_id,
             l.created_at,
             l.updated_at,
             l.created_by,
             l.updated_by
      from inserted i
      join linked l on l.template_id = i.template_id;`;
    const { rows } = await pool.query(sql, [
      sanitizedWeek,
      sanitizedLabel,
      sanitizedNotes,
      sanitizedDueOffset,
      sanitizedRequired,
      sanitizedVisibility,
      sanitizedSortOrder,
      status ?? 'draft',
      program_id,
      sanitizedVisible,
      req.user?.id ?? null,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.code || 'invalid_payload' });
    }
    console.error('POST /programs/:id/templates error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/programs/:program_id/templates/metadata', ensurePerm('template.update'), async (req, res) => {
  const { program_id } = req.params;
  if (!program_id) {
    return res.status(400).json({ error: 'invalid_program' });
  }
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  if (!updates.length) {
    return res.status(400).json({ error: 'no_updates' });
  }
  try {
    if (!req.roles.includes('admin')) {
      const ok = await userManagesProgram(req.user.id, program_id);
      if (!ok) return res.status(403).json({ error: 'forbidden' });
    }
    const normalized = [];
    for (const raw of updates) {
      if (!raw || typeof raw !== 'object') continue;
      const templateId = raw.template_id ?? raw.templateId ?? raw.id;
      if (!templateId) continue;

      const { patch, hasField, error } = buildTemplateMetadataPatch(raw);
      if (error) {
        return res.status(400).json({ error });

      }
      if (!Object.keys(linkPatch).length && !Object.keys(templatePatch).length) continue;
      normalized.push({ templateId, linkPatch, templatePatch });
    }
    if (!normalized.length) {
      return res.status(400).json({ error: 'no_updates' });
    }

    const client = await pool.connect();
    let totalUpdated = 0;
    try {
      await client.query('begin');
      for (const entry of normalized) {

        const fields = Object.keys(entry.patch);
        if (!fields.length) continue;
        const result = await programTemplateLinksDao.updateMetadata({
          programId: program_id,
          templateId: entry.templateId,
          patch: entry.patch,
          db: client,
        });
        if (result.updated) {
          totalUpdated += 1;
        }

      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    res.json({ updated: totalUpdated });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.code || 'invalid_payload' });
    }
    console.error('PATCH /programs/:id/templates/metadata error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/programs/:program_id/templates/:template_id', ensurePerm('template.update'), async (req, res) => {
  try {
    const { program_id, template_id } = req.params;
    if (!program_id || !template_id) return res.status(400).json({ error: 'Invalid id' });
    const programId = program_id;
    const templateId = template_id;
    if (!req.roles.includes('admin')) {
      const ok = await userManagesProgram(req.user.id, programId);
      if (!ok) return res.status(403).json({ error: 'forbidden' });
    }
    const updates = req.body || {};
    const linkPatch = sanitizeLinkMetadata(updates);
    const templatePatch = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'label')) {
      templatePatch.label = toNullableString(updates.label);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'external_link')) {
      templatePatch.external_link = toNullableString(updates.external_link);
    } else if (Object.prototype.hasOwnProperty.call(updates, 'hyperlink')) {
      templatePatch.external_link = toNullableString(updates.hyperlink);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      const statusValue = updates.status;
      if (typeof statusValue !== 'string') {
        return res.status(400).json({ error: 'invalid_status' });
      }
      const normalizedStatus = statusValue.toLowerCase();
      if (!TEMPLATE_STATUSES.has(normalizedStatus)) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      templatePatch.status = normalizedStatus;
    }
    if (!Object.keys(linkPatch).length && !Object.keys(templatePatch).length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    try {
      const updatedTemplate = await withTransaction(req, async client => {
        let rowsUpdated = 0;
        if (Object.keys(linkPatch).length) {
          linkPatch.updated_by = req.user?.id ?? null;
          const { updated } = await programTemplateLinksDao.updateLink({
            programId,
            templateId,
            patch: linkPatch,
            db: client,
          });
          if (updated) rowsUpdated += 1;
        }
        if (Object.keys(templatePatch).length) {
          const assignments = [];
          const params = [];
          Object.entries(templatePatch).forEach(([field, value]) => {
            params.push(value);
            assignments.push(`${field} = $${params.length}`);
          });
          params.push(programId);
          const programPlaceholder = `$${params.length}`;
          params.push(templateId);
          const templatePlaceholder = `$${params.length}`;
          const sql = `
            update public.program_task_templates
               set ${assignments.join(', ')}
             where template_id = ${templatePlaceholder}
               and deleted_at is null
               and exists (
                 select 1
                   from public.program_template_links
                  where template_id = ${templatePlaceholder}
                    and program_id = ${programPlaceholder}
               )
          `;
          const result = await client.query(sql, params);
          rowsUpdated += result.rowCount;
        }
        if (!rowsUpdated) {
          throw createHttpError(404, 'not_found');
        }
        const refreshed = await programTemplateLinksDao.getTemplateForProgram({
          programId,
          templateId,
          includeDeleted: false,
          db: client,
        });
        if (!refreshed) {
          throw createHttpError(404, 'not_found');
        }
        return refreshed;
      });
      res.json(updatedTemplate);
    } catch (err) {
      if (err?.status === 404) {
        return res.status(404).json({ error: err.code || 'Not found' });
      }
      throw err;
    }
  } catch (err) {
    console.error('PATCH /programs/:id/templates/:template_id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/programs/:program_id/templates/reorder', ensurePerm('template.update'), async (req, res) => {
  const { program_id } = req.params;
  if (!program_id) {
    return res.status(400).json({ error: 'invalid_program' });
  }
  const order = Array.isArray(req.body?.order) ? req.body.order : [];
  if (!order.length) {
    return res.status(400).json({ error: 'invalid_order' });
  }
  try {
    if (!req.roles.includes('admin')) {
      const ok = await userManagesProgram(req.user.id, program_id);
      if (!ok) return res.status(403).json({ error: 'forbidden' });
    }
    const normalizedOrder = order
      .map(value => {
        if (value === null || value === undefined || value === '') return null;
        return String(value);
      })
      .filter(value => value !== null);
    if (!normalizedOrder.length) {
      return res.status(400).json({ error: 'invalid_order' });
    }
    const client = await pool.connect();
    let updated = 0;
    try {
      await client.query('begin');
      const params = [];
      const tuples = [];
      normalizedOrder.forEach((templateId, index) => {
        params.push(templateId);
        const templateParamIndex = params.length;
        params.push(index + 1);
        const sortParamIndex = params.length;
        tuples.push(`($${templateParamIndex}, $${sortParamIndex})`);
      });
      params.push(program_id);
      const programParamIndex = params.length;
      params.push(req.user?.id ?? null);
      const updatedByIndex = params.length;
      const sql = `
        update public.program_template_links l
           set sort_order = v.sort_order,
               updated_by = $${updatedByIndex}
          from (values ${tuples.join(', ')}) as v(template_id, sort_order)
         where l.template_id = v.template_id
           and l.program_id = $${programParamIndex}
      `;
      const result = await client.query(sql, params);
      updated = result.rowCount;
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    res.json({ updated });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.code || 'invalid_payload' });
    }
    console.error('POST /programs/:id/templates/reorder error', err);
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
    const sql = `
      update public.program_task_templates
         set deleted_at = now()
       where template_id = $2
         and deleted_at is null
         and exists (
           select 1
             from public.program_template_links
            where template_id = $2
              and program_id = $1
         )
    `;
    const result = await pool.query(sql, [program_id, template_id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /programs/:id/templates/:template_id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/programs/:program_id/templates/:template_id/restore', ensurePerm('template.delete'), async (req, res) => {
  try {
    const { program_id, template_id } = req.params;
    if (!program_id || !template_id) return res.status(400).json({ error: 'Invalid id' });
    if (!req.roles.includes('admin')) {
      const ok = await userManagesProgram(req.user.id, program_id);
      if (!ok) return res.status(403).json({ error: 'forbidden' });
    }
    const sql = `
      update public.program_task_templates
         set deleted_at = null
       where template_id = $2
         and deleted_at is not null
         and exists (
           select 1
             from public.program_template_links
            where template_id = $2
              and program_id = $1
         )
    `;
    const result = await pool.query(sql, [program_id, template_id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ restored: true });
  } catch (err) {
    console.error('POST /programs/:id/templates/:template_id/restore error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const FIELD_ALIASES = {
  time: 'scheduled_time'
};

app.post('/programs/:program_id/instantiate', ensureAuth, async (req, res) => {
  try {
    const { program_id } = req.params;
    const trainee = req.user.full_name || '';
    
const sql = `
  insert into public.orientation_tasks
    (user_id, trainee, label, scheduled_for, scheduled_time, done, program_id, week_number, notes, journal_entry, responsible_person)
  select $1, $2, t.label, null, null, false, l.program_id, coalesce(l.week_number, t.week_number), coalesce(l.notes, t.notes), null, null
  from public.program_task_templates t
  join public.program_template_links l on l.template_id = t.template_id
  left join public.orientation_tasks ot
    on ot.user_id = $1
   and ot.program_id = l.program_id
   and ot.label = t.label
   and coalesce(ot.week_number, -1) = coalesce(coalesce(l.week_number, t.week_number), -1)
   and ot.deleted = false
  where l.program_id = $3
    and t.deleted_at is null
    and ot.task_id is null
  order by coalesce(l.week_number, t.week_number), coalesce(l.sort_order, t.sort_order), t.template_id
  returning *;`;

    const { rows } = await pool.query(sql, [req.user.id, trainee, program_id]);

// Remember this program as the user's current preference
await pool.query(`
  insert into public.user_preferences (user_id, program_id, updated_at)
  values ($1, $2, now())
  on conflict (user_id) do update
    set program_id = excluded.program_id, updated_at = now()
`, [req.user.id, program_id]);

    res.json({ created: rows.length });
  } catch (err) {
    console.error('POST /programs/:id/instantiate error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Preload a program's templates into another user's tasks (admin or manager of the program)
app.post('/rbac/users/:id/programs/:program_id/instantiate', ensureAuth, async (req, res) => {
  try {
    const { id: targetUserId, program_id } = req.params;

    // Permission: admin OR manager of this program
    const roles = Array.isArray(req.roles) ? req.roles : [];
    const isAdmin = roles.includes('admin');
    const hasManagerRole = roles.includes('manager');

    let canManage = isAdmin || hasManagerRole;
    if (!canManage) {
      try { canManage = await userManagesProgram(req.user.id, program_id); } catch (_e) {}
    }
    if (!canManage) return res.status(403).json({ error: 'forbidden' });

    // Get target user's display name for the "trainee" field
    const { rows: urows } = await pool.query(
      'select id, full_name from public.users where id=$1',
      [targetUserId]
    );
    if (!urows.length) return res.status(404).json({ error: 'user_not_found' });

    const trainee = urows[0].full_name || '';

    // Copy program templates to target user's orientation_tasks
    
const copySql = `
  insert into public.orientation_tasks
    (user_id, trainee, label, scheduled_for, scheduled_time, done, program_id, week_number, notes, journal_entry, responsible_person)
  select $1, $2, t.label, null, null, false, l.program_id, coalesce(l.week_number, t.week_number), coalesce(l.notes, t.notes), null, null
  from public.program_task_templates t
  join public.program_template_links l on l.template_id = t.template_id
  left join public.orientation_tasks ot
    on ot.user_id = $1
   and ot.program_id = l.program_id
   and ot.label = t.label
   and coalesce(ot.week_number, -1) = coalesce(coalesce(l.week_number, t.week_number), -1)
   and ot.deleted = false
  where l.program_id = $3
    and t.deleted_at is null
    and ot.task_id is null
  order by coalesce(l.week_number, t.week_number), coalesce(l.sort_order, t.sort_order), t.template_id
  returning task_id;`;

    const { rowCount } = await pool.query(copySql, [targetUserId, trainee, program_id]);

    // Make this program the target user's current program preference (so their UI opens on it)
    await pool.query(`
      insert into public.user_preferences (user_id, program_id, updated_at)
      values ($1, $2, now())
      on conflict (user_id) do update
        set program_id = excluded.program_id, updated_at = now()
    `, [targetUserId, program_id]);

    res.json({ ok: true, created: rowCount });
  } catch (err) {
    console.error('POST /rbac/users/:id/programs/:program_id/instantiate error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==== 8) API: tasks (per-user) ====
// Expect public.orientation_tasks to include: user_id uuid references users(id)
// If you haven’t added user_id yet, run the migration described in comments below.

app.get('/tasks', ensureAuth, async (req, res) => {
  try {
    const { start, end, program_id, include_deleted, user_id } = req.query;
    const conds = [];
    const vals = [];

    if (!(include_deleted === 'true' || include_deleted === '1')) {
      conds.push('deleted = false');
    }

    if (start) { vals.push(start); conds.push(`scheduled_for >= $${vals.length}`); }
    if (end)   { vals.push(end);   conds.push(`scheduled_for <= $${vals.length}`); }
    if (program_id) { vals.push(program_id); conds.push(`program_id = $${vals.length}`); }

    const roles = Array.isArray(req.roles) ? req.roles : [];
    const isAdmin = roles.includes('admin');
    const hasManagerRole = roles.includes('manager');

    let canManage = isAdmin || hasManagerRole;
    if (!canManage && program_id) {
      try { canManage = await userManagesProgram(req.user.id, program_id); } catch (_e) { /* ignore */ }
    }

    if (canManage) {
      if (user_id) { vals.push(user_id); conds.push(`user_id = $${vals.length}`); }
    } else {
      vals.push(req.user.id);
      conds.push(`user_id = $${vals.length}`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const sql = `SELECT * FROM public.orientation_tasks ${where}
                 ORDER BY scheduled_for NULLS LAST, task_id`;
    const { rows } = await pool.query(sql, vals);
    res.json(rows);
  } catch (err) {
    console.error('GET /tasks error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/tasks', ensurePerm('task.create'), async (req, res) => {
  try {
    const {
      label,
      scheduled_for = null,
      scheduled_time: scheduledTimeField,
      time: timeField,
      done = false,
      program_id = null,
      week_number = null,
      notes = null,
      journal_entry = null,
      responsible_person = null,
      user_id = req.user.id
    } = req.body || {};

    const scheduled_time = typeof timeField !== 'undefined'
      ? timeField
      : typeof scheduledTimeField !== 'undefined'
        ? scheduledTimeField
        : null;

    const roles = Array.isArray(req.roles) ? req.roles : [];
    const isAdmin = roles.includes('admin');
    const hasManagerRole = roles.includes('manager');

    if (user_id !== req.user.id) {
      let canManage = isAdmin || hasManagerRole;
      if (!canManage && program_id) {
        try { canManage = await userManagesProgram(req.user.id, program_id); } catch (_e) { /* ignore */ }
      }
      if (!canManage) {
        return res.status(403).json({ error: 'forbidden' });
      }
    }

    let trainee = req.user.full_name || '';
    if (user_id !== req.user.id) {
      try {
        const { rows: t } = await pool.query('select full_name from public.users where id=$1', [user_id]);
        trainee = t[0]?.full_name || '';
      } catch (_e) { /* ignore */ }
    }

    const sql = `
      INSERT INTO public.orientation_tasks
        (user_id, trainee, label, scheduled_for, scheduled_time, done, program_id, week_number, notes, journal_entry, responsible_person)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *;`;
    const vals = [
      user_id,
      trainee,
      label,
      scheduled_for,
      scheduled_time,
      !!done,
      program_id,
      week_number,
      notes,
      journal_entry,
      responsible_person
    ];
    const { rows } = await pool.query(sql, vals);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /tasks error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/tasks/:id', ensurePerm('task.update', 'task.assign'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('select user_id, program_id from public.orientation_tasks where task_id=$1', [id]);
    const task = existing[0];
    if (!task) return res.status(404).json({ error: 'Not found' });

    const allFields = ['label','scheduled_for','time','done','program_id','week_number','notes','journal_entry','responsible_person'];
    const roles = Array.isArray(req.roles) ? req.roles : [];
    const isAdmin = roles.includes('admin');
    const hasManagerRole = roles.includes('manager');
    const owns = task.user_id === req.user.id;
    const isTrainee = roles.includes('trainee');
    const permSet = req.perms instanceof Set
      ? req.perms
      : new Set(Array.isArray(req.perms) ? req.perms : []);
    const hasTaskUpdatePerm = isAdmin || permSet.has('task.update');
    const hasTaskAssignPerm = isAdmin || permSet.has('task.assign');

    let canManageTask = isAdmin || hasManagerRole;
    if (!canManageTask) {
      try { canManageTask = await userManagesProgram(req.user.id, task.program_id); } catch (_e) { /* ignore */ }
    }

    let allowed;
    if (canManageTask) {
      if (!hasTaskUpdatePerm && hasTaskAssignPerm) {
        allowed = ['scheduled_for', 'time'];
      } else {
        allowed = allFields;
      }
    } else if (isTrainee && owns) {
      allowed = ['done'];
    } else {
      return res.status(403).json({ error: 'forbidden' });
    }

    const allowedCanonical = new Set(allowed.map(field => FIELD_ALIASES[field] || field));

    for (const k of Object.keys(req.body)) {
      const canonical = FIELD_ALIASES[k] || k;
      if (!allowedCanonical.has(canonical)) return res.status(403).json({ error: 'forbidden' });
    }

    if ('program_id' in req.body && req.body.program_id !== task.program_id) {
      if (!(isAdmin || hasManagerRole)) {
        const managesNew = await userManagesProgram(req.user.id, req.body.program_id);
        if (!managesNew) return res.status(403).json({ error: 'forbidden' });
      }
    }

    const fields = [];
    const vals = [];
    for (const [key, rawValue] of Object.entries(req.body)) {
      const canonical = FIELD_ALIASES[key] || key;
      if (!allowedCanonical.has(canonical)) continue;
      const value = canonical === 'done' ? !!rawValue : rawValue;
      vals.push(value);
      fields.push(`${canonical} = $${vals.length}`);
    }

    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    vals.push(id);
    const sql = `UPDATE public.orientation_tasks
                 SET ${fields.join(', ')}
                 WHERE task_id = $${vals.length}
                 RETURNING *;`;
    const { rows } = await pool.query(sql, vals);
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /tasks/:id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/tasks/:id', ensurePerm('task.delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('select user_id, program_id from public.orientation_tasks where task_id=$1', [id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Not found' });

    const roles = Array.isArray(req.roles) ? req.roles : [];
    const isAdmin = roles.includes('admin');
    const hasManagerRole = roles.includes('manager');

    let canManage = isAdmin || hasManagerRole;
    if (!canManage && req.user?.id && task.program_id) {
      try { canManage = await userManagesProgram(req.user.id, task.program_id); } catch (_e) { /* ignore */ }
    }

    if (!canManage) {
      return res.status(403).json({ error: 'forbidden' });
    }

    await pool.query('UPDATE public.orientation_tasks SET deleted=true WHERE task_id = $1', [id]);
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
  created_at   timestamptz default now(),
  deleted_at   timestamp
);

create table if not exists public.program_task_templates (
  template_id bigserial primary key,
  week_number int,
  label       text not null,
  notes       text,
  sort_order  int,
  status      text default 'draft',
  deleted_at  timestamp
);

create table if not exists public.program_template_links (
  template_id bigint not null references public.program_task_templates(template_id) on delete cascade,
  program_id  text not null references public.programs(program_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (template_id, program_id)
);
create index if not exists idx_program_template_links_program on public.program_template_links(program_id);

-- Tasks: add user_id (owning user)
alter table public.orientation_tasks
  add column if not exists user_id uuid references public.users(id);

-- Soft delete flag for tasks
alter table public.orientation_tasks
  add column if not exists deleted boolean default false;

-- Optional backfill for legacy rows (assign to first admin user)
-- update public.orientation_tasks set user_id = (select id from public.users order by created_at limit 1) where user_id is null;
*/
