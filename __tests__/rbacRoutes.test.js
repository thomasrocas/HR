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
        organization text,
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
      create table public.programs (
        program_id uuid primary key,
        title text,
        deleted boolean default false
      );
      create table public.orientation_tasks (
        task_id uuid primary key,
        user_id uuid,
        trainee text,
        label text,
        scheduled_for date,
        scheduled_time time,
        due_date date,
        done boolean,
        program_id uuid,
        week_number int,
        notes text,
        journal_entry text,
        responsible_person text,
        deleted boolean default false
      );
      insert into public.roles(role_key) values ('admin'),('manager'),('viewer'),('trainee'),('auditor');
    `);
  });

  afterEach(async () => {
    await pool.query('delete from public.orientation_tasks');
    await pool.query('delete from public.programs');
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

    const programId = crypto.randomUUID();
    await pool.query('insert into public.programs(program_id, title) values ($1,$2)', [programId, 'Orientation Program']);
    await pool.query(
      'insert into public.orientation_tasks(task_id, user_id, label, program_id, deleted) values ($1,$2,$3,$4,false)',
      [crypto.randomUUID(), userId, 'Welcome Task', programId]
    );

    const adminAgent = request.agent(app);
    await adminAgent.post('/auth/local/login').send({ username: 'admin', password: 'passpass' }).expect(200);

    const listRes = await adminAgent.get('/rbac/users').expect(200);
    expect(listRes.body.length).toBe(2);
    const targetUser = listRes.body.find(entry => entry.id === userId);
    expect(targetUser).toBeTruthy();
    expect(targetUser.assigned_programs).toEqual([
      {
        id: programId,
        name: 'Orientation Program',
        program_id: programId,
        title: 'Orientation Program',
      },
    ]);

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

  test('manager can list users and only assign viewer or trainee roles', async () => {
    const mgrId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query(
      'insert into public.users(id, username, full_name, password_hash, provider) values ($1,$2,$3,$4,$5)',
      [mgrId, 'mgr', 'Mgr', hash, 'local']
    );
    await pool.query(
      'insert into public.users(id, username, full_name, password_hash, provider) values ($1,$2,$3,$4,$5)',
      [userId, 'user', 'User', hash, 'local']
    );
    await pool.query(
      "insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='manager'",
      [mgrId]
    );

    const mgrAgent = request.agent(app);
    await mgrAgent
      .post('/auth/local/login')
      .send({ username: 'mgr', password: 'passpass' })
      .expect(200);

    const listRes = await mgrAgent.get('/rbac/users').expect(200);
    expect(listRes.body.length).toBe(2);

    // manager allowed to assign viewer and trainee
    await mgrAgent
      .patch(`/rbac/users/${userId}/roles`)
      .send({ roles: ['viewer', 'trainee'] })
      .expect(200);
    let { rows } = await pool.query(
      'select r.role_key from public.user_roles ur join public.roles r on ur.role_id=r.role_id where ur.user_id=$1',
      [userId]
    );
    expect(rows.map(r => r.role_key).sort()).toEqual(['trainee', 'viewer']);

    // manager cannot assign admin role
    await mgrAgent
      .patch(`/rbac/users/${userId}/roles`)
      .send({ roles: ['admin'] })
      .expect(403);
    ({ rows } = await pool.query(
      'select r.role_key from public.user_roles ur join public.roles r on ur.role_id=r.role_id where ur.user_id=$1',
      [userId]
    ));
    expect(rows.map(r => r.role_key).sort()).toEqual(['trainee', 'viewer']);

    // manager cannot assign manager role
    await mgrAgent
      .patch(`/rbac/users/${userId}/roles`)
      .send({ roles: ['manager'] })
      .expect(403);
    ({ rows } = await pool.query(
      'select r.role_key from public.user_roles ur join public.roles r on ur.role_id=r.role_id where ur.user_id=$1',
      [userId]
    ));
    expect(rows.map(r => r.role_key).sort()).toEqual(['trainee', 'viewer']);
  });

  test('admin can update user profile, trims organization, and prevents duplicate emails', async () => {
    const adminId = crypto.randomUUID();
    const targetId = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query(
      'insert into public.users(id, username, email, full_name, organization, password_hash, provider) values ($1,$2,$3,$4,$5,$6,$7)',
      [adminId, 'admin', 'admin@example.com', 'Admin', 'Admin Org', hash, 'local']
    );
    await pool.query(
      'insert into public.users(id, username, email, full_name, organization, password_hash, provider) values ($1,$2,$3,$4,$5,$6,$7)',
      [targetId, 'user', 'user@example.com', 'User', 'Original Org', hash, 'local']
    );
    await pool.query(
      'insert into public.users(id, username, email, full_name, organization, password_hash, provider) values ($1,$2,$3,$4,$5,$6,$7)',
      [otherId, 'other', 'other@example.com', 'Other', null, hash, 'local']
    );
    await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [
      adminId,
      'admin',
    ]);

    const adminAgent = request.agent(app);
    await adminAgent.post('/auth/local/login').send({ username: 'admin', password: 'passpass' }).expect(200);

    const updateRes = await adminAgent
      .patch(`/api/users/${targetId}`)
      .send({ name: '  Updated User  ', email: '  updated@example.com  ', organization: '  Example Org  ' })
      .expect(200);

    expect(updateRes.body).toMatchObject({
      id: targetId,
      full_name: 'Updated User',
      name: 'Updated User',
      email: 'updated@example.com',
      organization: 'Example Org',
    });
    expect(Array.isArray(updateRes.body.roles)).toBe(true);

    let { rows } = await pool.query('select email, full_name, organization from public.users where id=$1', [targetId]);
    expect(rows[0]).toEqual({
      email: 'updated@example.com',
      full_name: 'Updated User',
      organization: 'Example Org',
    });

    await adminAgent
      .patch(`/api/users/${targetId}`)
      .send({ email: 'other@example.com' })
      .expect(409);

    const clearedRes = await adminAgent
      .patch(`/api/users/${targetId}`)
      .send({ organization: '   ' })
      .expect(200);
    expect(clearedRes.body.organization).toBeNull();

    ({ rows } = await pool.query('select organization from public.users where id=$1', [targetId]));
    expect(rows[0]).toEqual({ organization: null });

    const listRes = await adminAgent.get('/rbac/users').expect(200);
    const refreshed = listRes.body.find(u => u.id === targetId);
    expect(refreshed.organization).toBeNull();
  });
});
