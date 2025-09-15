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

describe('preferences routes authorization', () => {
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
      create table public.roles (
        role_id serial primary key,
        role_key text unique,
        description text
      );
      create table public.permissions (
        perm_id serial primary key,
        perm_key text unique
      );
      create table public.user_roles (
        user_id uuid,
        role_id int references public.roles(role_id)
      );
      create table public.role_permissions (
        role_id int references public.roles(role_id),
        perm_id int references public.permissions(perm_id)
      );
      create table public.program_memberships (
        user_id uuid,
        program_id text,
        role text
      );
      create table public.user_preferences (
        user_id uuid primary key,
        program_id text,
        start_date date,
        num_weeks int,
        trainee text,
        updated_at timestamptz
      );
      insert into public.roles(role_key) values ('admin'),('manager'),('trainee');
    `);
  });

  afterEach(async () => {
    await pool.query('delete from public.user_preferences');
    await pool.query('delete from public.program_memberships');
    await pool.query('delete from public.user_roles');
    await pool.query('delete from public.role_permissions');
    await pool.query('delete from public.permissions');
    await pool.query('delete from public.session');
    await pool.query('delete from public.users');
  });

  test('admin can read and modify preferences for others', async () => {
    const adminId = crypto.randomUUID();
    const traineeId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [adminId,'admin',hash,'local','Admin']);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [traineeId,'trainee',hash,'local','Trainee']);
    await pool.query("insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='admin'", [adminId]);
    await pool.query("insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='trainee'", [traineeId]);
    await pool.query('insert into public.user_preferences(user_id, program_id) values ($1,$2)', [traineeId,'prog1']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username:'admin', password:'passpass' }).expect(200);

    let res = await agent.get(`/prefs?user_id=${traineeId}`).expect(200);
    expect(res.body.program_id).toBe('prog1');

    res = await agent.patch('/prefs').send({ user_id: traineeId, program_id: 'prog2' }).expect(200);
    expect(res.body.program_id).toBe('prog2');
  });

  test('manager can read and modify preferences for managed program but not others', async () => {
    const managerId = crypto.randomUUID();
    const t1 = crypto.randomUUID();
    const t2 = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [managerId,'mgr',hash,'local','Manager']);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [t1,'trainee1',hash,'local','Trainee1']);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [t2,'trainee2',hash,'local','Trainee2']);
    await pool.query("insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='manager'", [managerId]);
    await pool.query("insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='trainee'", [t1]);
    await pool.query("insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='trainee'", [t2]);
    await pool.query('insert into public.program_memberships(user_id, program_id, role) values ($1,$2,$3)', [managerId,'prog1','manager']);
    await pool.query('insert into public.user_preferences(user_id, program_id) values ($1,$2)', [t1,'prog1']);
    await pool.query('insert into public.user_preferences(user_id, program_id) values ($1,$2)', [t2,'prog2']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username:'mgr', password:'passpass' }).expect(200);

    let res = await agent.get(`/prefs?user_id=${t1}`).expect(200);
    expect(res.body.program_id).toBe('prog1');

    res = await agent.patch('/prefs').send({ user_id: t1, program_id: 'prog1' }).expect(200);
    expect(res.body.program_id).toBe('prog1');

    await agent.get(`/prefs?user_id=${t2}`).expect(403);
    await agent.patch('/prefs').send({ user_id: t1, program_id: 'prog2' }).expect(403);
  });

  test('trainee cannot access or modify others preferences', async () => {
    const u1 = crypto.randomUUID();
    const u2 = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [u1,'user1',hash,'local','U1']);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [u2,'user2',hash,'local','U2']);
    await pool.query("insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='trainee'", [u1]);
    await pool.query("insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='trainee'", [u2]);
    await pool.query('insert into public.user_preferences(user_id, program_id) values ($1,$2)', [u2,'prog1']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username:'user1', password:'passpass' }).expect(200);
    await agent.get(`/prefs?user_id=${u2}`).expect(403);
    await agent.patch('/prefs').send({ user_id: u2, program_id: 'prog1' }).expect(403);
  });
});

