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

describe('account routes', () => {
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

  test('get /me returns roles and permissions', async () => {
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, email, full_name, password_hash, provider) values ($1,$2,$3,$4,$5,$6)', [id, 'user1', 'u1@example.com', 'User One', hash, 'local']);
    await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [id, 'manager']);
    await pool.query(`
      insert into public.role_permissions(role_id, perm_key)
      select role_id, $2 from public.roles where role_key=$1
    `, ['manager', 'perm1']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'user1', password: 'passpass' }).expect(200);

    const res = await agent.get('/me').expect(200);
    expect(res.body.roles).toEqual(['manager']);
    expect(res.body.perms).toEqual(['perm1']);
    expect(res.body.id).toBe(id);
  });

  test('patch /me updates account fields', async () => {
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, email, full_name, password_hash, provider) values ($1,$2,$3,$4,$5,$6)', [id, 'user1', 'u1@example.com', 'User One', hash, 'local']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'user1', password: 'passpass' }).expect(200);

    const res = await agent.patch('/me').send({ full_name: 'User 1', email: 'new@example.com', username: 'user1a' }).expect(200);
    expect(res.body.name).toBe('User 1');
    expect(res.body.email).toBe('new@example.com');
    expect(res.body.username).toBe('user1a');

    const { rows } = await pool.query('select full_name, email, username from public.users where id=$1', [id]);
    expect(rows[0]).toEqual({ full_name: 'User 1', email: 'new@example.com', username: 'user1a' });
  });

  test('change password updates hash', async () => {
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash('oldpass1', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [id, 'user2', hash, 'local']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'user2', password: 'oldpass1' }).expect(200);

    await agent.post('/auth/local/change-password').send({ current_password: 'oldpass1', new_password: 'newpass123' }).expect(200);

    const { rows } = await pool.query('select password_hash from public.users where id=$1', [id]);
    expect(await bcrypt.compare('newpass123', rows[0].password_hash)).toBe(true);
  });

  test('patch /me rejects duplicate username or email', async () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, email, full_name, password_hash, provider) values ($1,$2,$3,$4,$5,$6)', [id1, 'user1', 'u1@example.com', 'User One', hash, 'local']);
    await pool.query('insert into public.users(id, username, email, full_name, password_hash, provider) values ($1,$2,$3,$4,$5,$6)', [id2, 'user2', 'u2@example.com', 'User Two', hash, 'local']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'user1', password: 'passpass' }).expect(200);

    await agent.patch('/me').send({ username: 'user2' }).expect(409);
    await agent.patch('/me').send({ email: 'u2@example.com' }).expect(409);
  });

  test('change password rejects wrong current password', async () => {
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash('rightpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [id, 'user3', hash, 'local']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'user3', password: 'rightpass' }).expect(200);

    await agent.post('/auth/local/change-password').send({ current_password: 'wrongpass', new_password: 'newpass123' }).expect(400);

    const { rows } = await pool.query('select password_hash from public.users where id=$1', [id]);
    expect(await bcrypt.compare('rightpass', rows[0].password_hash)).toBe(true);
  });
});
