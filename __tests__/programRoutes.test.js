const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { newDb } = require('pg-mem');

// Mock pg to use pg-mem
const db = newDb();
const { Pool } = db.adapters.createPg();
jest.mock('pg', () => ({ Pool }));

// Require app after mocks
const { app, pool } = require('../orientation_server.js');

describe('program routes', () => {
  beforeAll(async () => {
    await pool.query(`
      create table public.users (
        id uuid primary key,
        username text unique,
        email text,
        full_name text,
        password_hash text,
        provider text,
        last_login_at timestamptz
      );
      create table public.session (
        sid text primary key,
        sess jsonb not null,
        expire timestamp(6) not null
      );
      create table public.programs (
        program_id text primary key,
        title text not null,
        total_weeks int,
        description text,
        created_by uuid,
        created_at timestamptz default now()
      );
      create table public.program_task_templates (
        template_id uuid primary key,
        program_id text,
        week_number int,
        label text not null,
        notes text,
        sort_order int
      );
    `);
  });

  afterEach(async () => {
    await pool.query('delete from public.program_task_templates');
    await pool.query('delete from public.programs');
    await pool.query('delete from public.session');
    await pool.query('delete from public.users');
  });

  test('patch updates program fields', async () => {
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('pass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'u1', hash, 'local']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'u1', password: 'pass' }).expect(200);

    const progId = 'prog1';
    await pool.query('insert into public.programs(program_id, title, total_weeks, description, created_by) values ($1,$2,$3,$4,$5)', [progId, 'Old', 4, 'desc', userId]);

    const res = await agent.patch(`/programs/${progId}`).send({ title: 'New', total_weeks: 8 }).expect(200);
    expect(res.body.title).toBe('New');
    expect(res.body.total_weeks).toBe(8);

    const { rows } = await pool.query('select title, total_weeks from public.programs where program_id=$1', [progId]);
    expect(rows[0].title).toBe('New');
    expect(rows[0].total_weeks).toBe(8);
  });

  test('delete removes program and templates', async () => {
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('pass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'u2', hash, 'local']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'u2', password: 'pass' }).expect(200);

    const progId = 'prog2';
    await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'TBD', userId]);
    await pool.query('insert into public.program_task_templates(template_id, program_id, week_number, label) values ($1,$2,$3,$4)', [crypto.randomUUID(), progId, 1, 't1']);
    await pool.query('insert into public.program_task_templates(template_id, program_id, week_number, label) values ($1,$2,$3,$4)', [crypto.randomUUID(), progId, 2, 't2']);

    await agent.delete(`/programs/${progId}`).expect(200, { deleted: true });

    const progRows = await pool.query('select 1 from public.programs where program_id=$1', [progId]);
    expect(progRows.rowCount).toBe(0);
    const tmplRows = await pool.query('select 1 from public.program_task_templates where program_id=$1', [progId]);
    expect(tmplRows.rowCount).toBe(0);
  });
});
