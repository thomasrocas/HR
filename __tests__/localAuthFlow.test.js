const request = require('supertest');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { newDb } = require('pg-mem');

// Setup pg-mem and mock pg
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

// Require app after pg mock
const { app, pool } = require('../orientation_server.js');

describe('local auth flow', () => {
  beforeAll(async () => {
    await pool.query(`
      create table public.users (
        id uuid primary key default gen_random_uuid(),
        username text unique,
        email text,
        full_name text,
        organization text,
        hire_date date,
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
        last_login_at timestamptz,
        updated_at timestamptz
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
      insert into public.roles(role_key) values ('trainee');
    `);
  });

  afterEach(async () => {
    await pool.query('delete from public.session');
    await pool.query('delete from public.users');
    await pool.query('delete from public.user_roles');
  });

  test('register, update profile, change password, login with new password', async () => {
    const agent = request.agent(app);

    const reg = await agent
      .post('/auth/local/register')
      .send({
        username: 'newuser',
        password: 'passpass',
        email: 'old@example.com',
        full_name: 'Old Name'
      })
      .expect(200);

    expect(reg.body.ok).toBe(true);
    expect(reg.body.user.username).toBe('newuser');

    const { rows: roleRows } = await pool.query(
      'select r.role_key from public.user_roles ur join public.roles r on ur.role_id = r.role_id where ur.user_id=$1',
      [reg.body.user.id]
    );
    expect(roleRows.map(r => r.role_key)).toEqual(['trainee']);

    const updated = await agent
      .patch('/me')
      .send({ full_name: 'New Name', email: 'new@example.com' })
      .expect(200);

    expect(updated.body.name).toBe('New Name');
    expect(updated.body.email).toBe('new@example.com');
    expect(updated.body.username).toBe('newuser');

    await agent
      .post('/auth/local/change-password')
      .send({ current_password: 'passpass', new_password: 'betterpass' })
      .expect(200);

    await agent.post('/auth/logout').expect(200);

    await request(app)
      .post('/auth/local/login')
      .send({ username: 'newuser', password: 'betterpass' })
      .expect(200);
  });

  test.each(['suspended', 'archived'])('login blocked for %s accounts', async status => {
    const hash = await bcrypt.hash('passpass', 1);
    const { rows } = await pool.query(
      `insert into public.users (username, password_hash, status)
       values ($1, $2, $3)
       returning id`,
      ['disabled_user', hash, status]
    );

    const res = await request(app)
      .post('/auth/local/login')
      .send({ username: 'disabled_user', password: 'passpass' })
      .expect(403);

    expect(res.body).toEqual({ error: 'account_disabled' });

    const { rows: userRows } = await pool.query(
      'select last_login_at from public.users where id=$1',
      [rows[0].id]
    );
    expect(userRows[0].last_login_at).toBeNull();
  });
});
