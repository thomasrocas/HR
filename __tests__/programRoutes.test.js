const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { newDb } = require('pg-mem');

// Mock pg to use pg-mem
const db = newDb();
const { Pool: MockPool } = db.adapters.createPg();
db.public.registerFunction({
  name: 'to_timestamp',
  args: ['text'],
  returns: 'timestamptz',
  implementation: x => new Date(Number(x) * 1000)
});
jest.mock('pg', () => ({ Pool: MockPool }));

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
        sess text not null,
        expire timestamptz not null
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
      create table public.orientation_tasks (
        task_id uuid primary key,
        user_id uuid,
        trainee text,
        label text not null,
        scheduled_for date,
        done boolean,
        program_id text,
        week_number int,
        notes text,
        deleted boolean default false
      );
    `);
  });

  afterEach(async () => {
    await pool.query('delete from public.program_task_templates');
    await pool.query('delete from public.orientation_tasks');
    await pool.query('delete from public.programs');
    await pool.query('delete from public.session');
    await pool.query('delete from public.users');
  });

  test('patch updates program fields', async () => {
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user1', hash, 'local']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'user1', password: 'passpass' }).expect(200);

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
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user2', hash, 'local']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'user2', password: 'passpass' }).expect(200);

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

test('patch updates template fields', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user3', hash, 'local']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user3', password: 'passpass' }).expect(200);

  const progId = 'prog3';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = crypto.randomUUID();
  await pool.query('insert into public.program_task_templates(template_id, program_id, week_number, label, notes, sort_order) values ($1,$2,$3,$4,$5,$6)', [tmplId, progId, 1, 'old', 'n1', 1]);

  const res = await agent
    .patch(`/programs/${progId}/templates/${tmplId}`)
    .send({ week_number: 2, label: 'new', notes: 'n2', sort_order: 5 })
    .expect(200);

  expect(res.body.week_number).toBe(2);
  expect(res.body.label).toBe('new');
  expect(res.body.notes).toBe('n2');
  expect(res.body.sort_order).toBe(5);

  const { rows } = await pool.query('select week_number, label, notes, sort_order from public.program_task_templates where template_id=$1', [tmplId]);
  expect(rows[0]).toEqual({ week_number: 2, label: 'new', notes: 'n2', sort_order: 5 });
});

test('delete removes template row', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user4', hash, 'local']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user4', password: 'passpass' }).expect(200);

  const progId = 'prog4';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = crypto.randomUUID();
  await pool.query('insert into public.program_task_templates(template_id, program_id, week_number, label) values ($1,$2,$3,$4)', [tmplId, progId, 1, 'tmp']);

  await agent.delete(`/programs/${progId}/templates/${tmplId}`).expect(200, { deleted: true });

  const { rowCount } = await pool.query('select 1 from public.program_task_templates where template_id=$1', [tmplId]);
  expect(rowCount).toBe(0);
});

test('deleted task can be restored', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user5', hash, 'local']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user5', password: 'passpass' }).expect(200);

  const progId = 'prog5';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);

  const taskId = crypto.randomUUID();
  await pool.query('insert into public.orientation_tasks(task_id, user_id, label, program_id) values ($1,$2,$3,$4)', [taskId, userId, 'task', progId]);

  await agent.delete(`/tasks/${taskId}`).expect(200, { deleted: true });

  // after delete task not returned by GET /tasks
  let res = await agent.get('/tasks').expect(200);
  expect(res.body.find(t => t.task_id === taskId)).toBeUndefined();

  // row still exists with deleted flag
  const taskRows = await pool.query('select deleted from public.orientation_tasks where task_id=$1', [taskId]);
  expect(taskRows.rows[0].deleted).toBe(true);

  // restore
  await agent.post(`/tasks/${taskId}/restore`).expect(200);

  res = await agent.get('/tasks').expect(200);
  expect(res.body.find(t => t.task_id === taskId)).toBeDefined();

  const progRows = await pool.query('select 1 from public.programs where program_id=$1', [progId]);
  expect(progRows.rowCount).toBe(1);
});
});
