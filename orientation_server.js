const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

/* ==== 1) Postgres config (edit credentials if needed) ==== */
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',        // <- change if different
  password: '@DbAdmin@',   // <- change if different
  database: 'orientation'  // <- we are using the "orientation" DB
});

/* ==== 2) App + middleware ==== */
const app = express();
app.use(cors());           // ok because same-origin, still fine for tools
app.use(express.json());

/* ==== 3) Static website (index.html) on port 3002 ==== */
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'orientation_index.html'));
});

/* ==== 4) Health check ==== */
app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});

/* ==== 5) API: tasks (orientation_tasks table) ==== */
/* Tip: Run the CREATE TABLE I gave earlier for public.orientation_tasks */

app.get('/tasks', async (req, res) => {
  const { trainee, start, end } = req.query;
  const conds = [];
  const vals = [];
  if (trainee) { vals.push(trainee); conds.push(`trainee = $${vals.length}`); }
  if (start)   { vals.push(start);   conds.push(`scheduled_for >= $${vals.length}`); }
  if (end)     { vals.push(end);     conds.push(`scheduled_for <= $${vals.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const sql = `SELECT * FROM public.orientation_tasks ${where}
               ORDER BY scheduled_for NULLS LAST, task_id`;
  const { rows } = await pool.query(sql, vals);
  res.json(rows);
});

app.post('/tasks', async (req, res) => {
  const {
    trainee, label, scheduled_for = null,
    done = false, program_id = null, week_number = null, notes = null
  } = req.body;

  const sql = `
    INSERT INTO public.orientation_tasks
      (trainee, label, scheduled_for, done, program_id, week_number, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *;
  `;
  const vals = [trainee, label, scheduled_for, !!done, program_id, week_number, notes];
  const { rows } = await pool.query(sql, vals);
  res.status(201).json(rows[0]);
});

app.patch('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const vals = [];
  for (const key of ['trainee','label','scheduled_for','done','program_id','week_number','notes']) {
    if (key in req.body) {
      vals.push(key === 'done' ? !!req.body[key] : req.body[key]);
      fields.push(`${key} = $${vals.length}`);
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  vals.push(id);
  const sql = `UPDATE public.orientation_tasks
               SET ${fields.join(', ')}
               WHERE task_id = $${vals.length}
               RETURNING *;`;
  const { rows } = await pool.query(sql, vals);
  res.json(rows[0]);
});

app.delete('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM public.orientation_tasks WHERE task_id = $1', [id]);
  res.json({ deleted: true });
});

/* ==== 6) Start server on port 3002 ==== */
const PORT = 3002; // keep 3002 as you asked
app.listen(PORT, () => {
  console.log(`Orientation site + API running at http://localhost:${PORT}`);
});
