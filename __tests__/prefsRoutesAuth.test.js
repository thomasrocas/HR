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
        id uuid primary key default gen_random_uuid(),
        username text unique,
        email text,
        full_name text,
        organization text,
        discipline text,
        discipline_type text,
        last_name text,
        surname text,
        first_name text,
        department text,
        sub_unit text,
        status text default 'active' not null,
        password_hash text,
        provider text,
        google_id text,
        picture_url text,
        created_at timestamptz,
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
      insert into public.roles(role_key) values ('trainee'), ('manager'), ('viewer'), ('admin');
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

    res = await agent.patch('/prefs').send({ user_id: userId, program_id: 'prog2' }).expect(200);
    expect(res.body.program_id).toBe('prog2');
  });

  test('returns 400 when body user_id is invalid and does not run preference queries', async () => {
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query(
      'insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)',
      [userId, 'invalidpatch', hash, 'local', 'Invalid Patch User']
    );

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'invalidpatch', password: 'passpass' }).expect(200);

    const querySpy = jest.spyOn(pool, 'query');

    const res = await agent.patch('/prefs').send({ user_id: 'not-a-uuid', program_id: 'prog1' }).expect(400);
    expect(res.body).toEqual({ error: 'invalid_user_id' });

    const roleQueryCalls = querySpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('from user_roles ur join roles r on ur.role_id=r.role_id where ur.user_id=$1')
    );
    expect(roleQueryCalls).toHaveLength(0);

    querySpy.mockRestore();
  });

  test.each(['not-a-uuid', '12345', ''])('returns 400 when user_id query is invalid (%s)', async invalidUserId => {
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    const username = `invaliduser-${invalidUserId || 'empty'}`;
    await pool.query(
      'insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)',
      [userId, username, hash, 'local', 'Invalid User']
    );

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username, password: 'passpass' }).expect(200);

    const res = await agent.get(`/prefs?user_id=${encodeURIComponent(invalidUserId)}`).expect(400);
    expect(res.body).toEqual({ error: 'invalid_user_id' });
  });

  test('login seeds preferences trainee with user id instead of name', async () => {
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query(
      'insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)',
      [userId, 'prefuser', hash, 'local', 'Pref User']
    );

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'prefuser', password: 'passpass' }).expect(200);

    const { rows } = await pool.query('select trainee from public.user_preferences where user_id=$1', [userId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].trainee).toBe(userId);
    expect(rows[0].trainee).not.toBe('Pref User');
  });

  test('registration seeds preferences trainee with user id', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local/register')
      .send({
        username: 'newuser',
        email: 'newuser@example.com',
        full_name: 'New User',
        password: 'passpass'
      })
      .expect(200);

    const newUserId = res.body.user.id;
    const { rows } = await pool.query('select trainee from public.user_preferences where user_id=$1', [newUserId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].trainee).toBe(newUserId);
    expect(rows[0].trainee).not.toBe('New User');
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
