const bcrypt = require('bcrypt');
const { pool } = require('./auth'); // re-use your pg Pool
const SALT_ROUNDS = 12;

// Minimal username policy (tune as needed)
function validUsername(u){ return /^[a-zA-Z0-9._-]{3,32}$/.test(u || ''); }
function validPassword(p){ return typeof p === 'string' && p.length >= 8; }

// Register
async function registerLocal(req, res){
  const { username, email, full_name, password } = req.body || {};
  if (!validUsername(username) || !validPassword(password)) {
    return res.status(400).json({ error: 'invalid_credentials' });
  }

  // Ensure unique username / email
  const exists = await pool.query(
    'select 1 from public.users where username=$1 or email=$2 limit 1',
    [username, email || null]
  );
  if (exists.rowCount) return res.status(409).json({ error: 'already_exists' });

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const upsert = `
    insert into public.users (username, email, full_name, password_hash, provider)
    values ($1,$2,$3,$4,'local')
    returning *;`;
  const { rows } = await pool.query(upsert, [username, email || '', full_name || '', hash]);

  // Log the user in (create session) like Passport does
  req.login(rows[0], (err) => {
    if (err) return res.status(500).json({ error: 'session_error' });
    res.json({ ok: true, user: { id: rows[0].id, username: rows[0].username } });
  });
}

// Login
async function loginLocal(req, res){
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
}

// Logout (shared with Google flow)
function logout(req, res){
  req.logout?.( ()=>{} );
  req.session?.destroy(()=>{});
  res.json({ ok: true });
}

module.exports = { registerLocal, loginLocal, logout };
