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
db.public.registerFunction({
  name: 'gen_random_uuid',
  returns: 'uuid',
  implementation: () => crypto.randomUUID()
});
jest.mock('pg', () => ({ Pool: MockPool }));

// Require app after mocks
const { app, pool } = require('../orientation_server.js');

describe('task routes authorization', () => {
  beforeAll(async () => {
    await pool.query(`
      create table public.users (
        id uuid primary key,
        username text unique,
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
      create table public.orientation_tasks (
        task_id uuid primary key default gen_random_uuid(),
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
      create table public.user_roles (
        user_id uuid,
        role_key text
      );
      create table public.role_permissions (
        role_key text,
        perm_key text
      );
      create table public.program_memberships (
        user_id uuid,
        program_id text,
        role text
      );
    `);
  });

  afterEach(async () => {
    await pool.query('delete from public.orientation_tasks');
    await pool.query('delete from public.program_memberships');
    await pool.query('delete from public.user_roles');
    await pool.query('delete from public.role_permissions');
    await pool.query('delete from public.session');
    await pool.query('delete from public.users');
  });

  test('manager can view tasks for managed program', async () => {
    await pool.query(`
      insert into public.role_permissions(role_key, perm_key) values
      ('manager','task.create'),('manager','task.update'),('manager','task.delete'),
      ('trainee','task.create'),('trainee','task.update'),('trainee','task.delete');
    `);

    const managerId = crypto.randomUUID();
    const traineeId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [managerId,'mgr',hash,'local','Manager']);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [traineeId,'trainee',hash,'local','Trainee']);
    await pool.query('insert into public.user_roles(user_id, role_key) values ($1,$2)', [managerId,'manager']);
    await pool.query('insert into public.user_roles(user_id, role_key) values ($1,$2)', [traineeId,'trainee']);
    await pool.query('insert into public.program_memberships(user_id, program_id, role) values ($1,$2,$3)', [managerId,'prog1','manager']);
    const task1 = crypto.randomUUID();
    const task2 = crypto.randomUUID();
    await pool.query('insert into public.orientation_tasks(task_id, user_id, label, program_id) values ($1,$2,$3,$4)', [task1, traineeId,'t1','prog1']);
    await pool.query('insert into public.orientation_tasks(task_id, user_id, label, program_id) values ($1,$2,$3,$4)', [task2, traineeId,'t2','prog2']);

    const mgrAgent = request.agent(app);
    await mgrAgent.post('/auth/local/login').send({ username:'mgr', password:'passpass' }).expect(200);
    let res = await mgrAgent.get('/tasks?program_id=prog1').expect(200);
    expect(res.body.find(t => t.task_id === task1)).toBeDefined();
    res = await mgrAgent.get('/tasks?program_id=prog2').expect(200);
    expect(res.body.find(t => t.task_id === task2)).toBeUndefined();

    const traineeAgent = request.agent(app);
    await traineeAgent.post('/auth/local/login').send({ username:'trainee', password:'passpass' }).expect(200);
    res = await traineeAgent.get(`/tasks?user_id=${managerId}`).expect(200);
    expect(res.body.every(t => t.user_id === traineeId)).toBe(true);
  });

  test('post tasks requires managing program when assigning to others', async () => {
    await pool.query(`
      insert into public.role_permissions(role_key, perm_key) values
      ('manager','task.create'),('trainee','task.create');
    `);
    const managerId = crypto.randomUUID();
    const traineeId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass',1);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [managerId,'mgr',hash,'local','Manager']);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [traineeId,'trainee',hash,'local','Trainee']);
    await pool.query('insert into public.user_roles(user_id, role_key) values ($1,$2)', [managerId,'manager']);
    await pool.query('insert into public.user_roles(user_id, role_key) values ($1,$2)', [traineeId,'trainee']);
    await pool.query('insert into public.program_memberships(user_id, program_id, role) values ($1,$2,$3)', [managerId,'prog1','manager']);

    const traineeAgent = request.agent(app);
    await traineeAgent.post('/auth/local/login').send({ username:'trainee', password:'passpass' }).expect(200);
    await traineeAgent.post('/tasks').send({ label:'x', user_id: managerId, program_id:'prog1' }).expect(403);

    const mgrAgent = request.agent(app);
    await mgrAgent.post('/auth/local/login').send({ username:'mgr', password:'passpass' }).expect(200);
    const res = await mgrAgent.post('/tasks').send({ label:'m t', user_id: traineeId, program_id:'prog1' }).expect(201);
    expect(res.body.user_id).toBe(traineeId);
  });

  test('patch tasks limits fields by role', async () => {
    await pool.query(`
      insert into public.role_permissions(role_key, perm_key) values
      ('manager','task.update'),('trainee','task.update');
    `);
    const managerId = crypto.randomUUID();
    const traineeId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass',1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [managerId,'mgr',hash,'local']);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [traineeId,'trainee',hash,'local']);
    await pool.query('insert into public.user_roles(user_id, role_key) values ($1,$2)', [managerId,'manager']);
    await pool.query('insert into public.user_roles(user_id, role_key) values ($1,$2)', [traineeId,'trainee']);
    await pool.query('insert into public.program_memberships(user_id, program_id, role) values ($1,$2,$3)', [managerId,'prog1','manager']);
    const taskId = crypto.randomUUID();
    await pool.query('insert into public.orientation_tasks(task_id, user_id, label, done, program_id) values ($1,$2,$3,$4,$5)', [taskId, traineeId,'task',false,'prog1']);

    const traineeAgent = request.agent(app);
    await traineeAgent.post('/auth/local/login').send({ username:'trainee', password:'passpass'}).expect(200);
    await traineeAgent.patch(`/tasks/${taskId}`).send({ label:'new' }).expect(403);
    await traineeAgent.patch(`/tasks/${taskId}`).send({ done:true }).expect(200);

    const mgrAgent = request.agent(app);
    await mgrAgent.post('/auth/local/login').send({ username:'mgr', password:'passpass'}).expect(200);
    const res = await mgrAgent.patch(`/tasks/${taskId}`).send({ label:'mgr edit' }).expect(200);
    expect(res.body.label).toBe('mgr edit');
  });

  test('delete tasks follows scope rules', async () => {
    await pool.query(`
      insert into public.role_permissions(role_key, perm_key) values
      ('manager','task.delete'),('trainee','task.delete');
    `);
    const managerId = crypto.randomUUID();
    const traineeId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass',1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [managerId,'mgr',hash,'local']);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [traineeId,'trainee',hash,'local']);
    await pool.query('insert into public.user_roles(user_id, role_key) values ($1,$2)', [managerId,'manager']);
    await pool.query('insert into public.user_roles(user_id, role_key) values ($1,$2)', [traineeId,'trainee']);
    await pool.query('insert into public.program_memberships(user_id, program_id, role) values ($1,$2,$3)', [managerId,'prog1','manager']);

    const taskTrainee = crypto.randomUUID();
    const taskManager = crypto.randomUUID();
    await pool.query('insert into public.orientation_tasks(task_id, user_id, label, program_id) values ($1,$2,$3,$4)', [taskTrainee, traineeId,'tt','prog1']);
    await pool.query('insert into public.orientation_tasks(task_id, user_id, label, program_id) values ($1,$2,$3,$4)', [taskManager, managerId,'mt','prog1']);

    const traineeAgent = request.agent(app);
    await traineeAgent.post('/auth/local/login').send({ username:'trainee', password:'passpass'}).expect(200);
    await traineeAgent.delete(`/tasks/${taskManager}`).expect(403);

    const mgrAgent = request.agent(app);
    await mgrAgent.post('/auth/local/login').send({ username:'mgr', password:'passpass'}).expect(200);
    await mgrAgent.delete(`/tasks/${taskTrainee}`).expect(200, { deleted: true });
    const { rows } = await pool.query('select deleted from public.orientation_tasks where task_id=$1', [taskTrainee]);
    expect(rows[0].deleted).toBe(true);
  });
});
