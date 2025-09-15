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

describe('rbac admin routes', () => {
  beforeAll(async () => {
    await pool.query(`
      create table public.users (
        id uuid primary key,
        username text unique,
        email text,
        full_name text,
        password_hash text,
        provider text,
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
      insert into public.roles(role_key) values ('admin'),('manager'),('viewer'),('trainee'),('auditor');
    `);
  });

  afterEach(async () => {
    await pool.query('delete from public.session');
    await pool.query('delete from public.users');
    await pool.query('delete from public.user_roles');
    await pool.query('delete from public.role_permissions');
  });

  test('admin can list users and update roles; non-admin forbidden', async () => {
    const adminId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, full_name, password_hash, provider) values ($1,$2,$3,$4,$5)', [adminId, 'admin', 'Admin', hash, 'local']);
    await pool.query('insert into public.users(id, username, full_name, password_hash, provider) values ($1,$2,$3,$4,$5)', [userId, 'user', 'User', hash, 'local']);
    await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [adminId, 'admin']);

    const adminAgent = request.agent(app);
    await adminAgent.post('/auth/local/login').send({ username: 'admin', password: 'passpass' }).expect(200);

    const listRes = await adminAgent.get('/rbac/users').expect(200);
    expect(listRes.body.length).toBe(2);

    await adminAgent.patch(`/rbac/users/${userId}/roles`).send({ roles: ['manager'] }).expect(200);
    const { rows } = await pool.query('select r.role_key from public.user_roles ur join public.roles r on ur.role_id=r.role_id where ur.user_id=$1', [userId]);
    expect(rows.map(r => r.role_key)).toEqual(['manager']);

    // remove role to test non-admin access
    await adminAgent.patch(`/rbac/users/${userId}/roles`).send({ roles: [] }).expect(200);

    const userAgent = request.agent(app);
    await userAgent.post('/auth/local/login').send({ username: 'user', password: 'passpass' }).expect(200);
    await userAgent.get('/rbac/users').expect(403);
    await userAgent.patch(`/rbac/users/${adminId}/roles`).send({ roles: [] }).expect(403);
  });

  test('manager cannot list users or update roles', async () => {
    const managerId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, full_name, password_hash, provider) values ($1,$2,$3,$4,$5)', [managerId, 'mgr', 'Manager', hash, 'local']);
    await pool.query('insert into public.users(id, username, full_name, password_hash, provider) values ($1,$2,$3,$4,$5)', [userId, 'user', 'User', hash, 'local']);
    await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [managerId, 'manager']);

    const managerAgent = request.agent(app);
    await managerAgent.post('/auth/local/login').send({ username: 'mgr', password: 'passpass' }).expect(200);

    await managerAgent.get('/rbac/users').expect(403);
    await managerAgent.patch(`/rbac/users/${userId}/roles`).send({ roles: ['viewer'] }).expect(403);
  });
});
