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

describe('preferences routes', () => {
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
      create table public.user_roles (
        user_id uuid,
        role_id int references public.roles(role_id)
      );
      create table public.role_permissions (
        role_id int references public.roles(role_id),
        perm_key text
      );
      create table public.user_preferences (
        user_id uuid primary key,
        program_id text,
        start_date date,
        num_weeks int,
        trainee text,
        updated_at timestamptz
      );
      insert into public.roles(role_key) values ('trainee'), ('manager'), ('admin');
    `);
  });

  afterEach(async () => {
    await pool.query('delete from public.user_preferences');
    await pool.query('delete from public.user_roles');
    await pool.query('delete from public.role_permissions');
    await pool.query('delete from public.session');
    await pool.query('delete from public.users');
  });

  test('user can read and modify own preferences', async () => {
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [userId,'user',hash,'local','User']);
    await pool.query("insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='trainee'", [userId]);
    await pool.query('insert into public.user_preferences(user_id, program_id) values ($1,$2)', [userId,'prog1']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username:'user', password:'passpass' }).expect(200);

    let res = await agent.get('/prefs').expect(200);
    expect(res.body.program_id).toBe('prog1');

    res = await agent.patch('/prefs').send({ program_id: 'prog2' }).expect(200);
    expect(res.body.program_id).toBe('prog2');
  });

  test("manager cannot read or modify admin user's preferences", async () => {
    const adminId = crypto.randomUUID();
    const managerId = crypto.randomUUID();
    const adminHash = await bcrypt.hash('adminpass', 1);
    const managerHash = await bcrypt.hash('managerpass', 1);
    await pool.query(
      'insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)',
      [adminId, 'admin', adminHash, 'local', 'Admin User']
    );
    await pool.query(
      'insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)',
      [managerId, 'manager', managerHash, 'local', 'Manager User']
    );
    await pool.query(
      "insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='admin'",
      [adminId]
    );
    await pool.query(
      "insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='manager'",
      [managerId]
    );
    await pool.query(
      "insert into public.role_permissions(role_id, perm_key) select role_id, 'manage' from public.roles where role_key='manager'"
    );
    await pool.query('insert into public.user_preferences(user_id, program_id) values ($1,$2)', [adminId, 'prog1']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'manager', password: 'managerpass' }).expect(200);

    await agent.get(`/prefs?user_id=${adminId}`).expect(403);
    await agent.patch('/prefs').send({ user_id: adminId, program_id: 'prog2' }).expect(403);
  });
});
