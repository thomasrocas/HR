const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { newDb } = require('pg-mem');

const nextTemplateId = (() => {
  let value = 1000;
  return () => ++value;
})();

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
      create table public.roles (
        role_id serial primary key,
        role_key text unique,
        description text
      );
      create table public.programs (
        program_id text primary key,
        title text not null,
        total_weeks int,
        description text,
        created_by uuid,
        created_at timestamptz default now(),
        deleted_at timestamp
      );
      create table public.program_task_templates (
        template_id bigserial primary key,
        week_number int,
        label text not null,
        notes text,
        organization text,
        sub_unit text,
        due_offset_days int,
        required boolean,
        visibility text,
        sort_order int,
        status text default 'draft',
        deleted_at timestamp,
        external_link text
      );
      create table public.program_template_links (
        id uuid primary key default gen_random_uuid(),
        template_id bigint not null references public.program_task_templates(template_id) on delete cascade,
        program_id text not null references public.programs(program_id) on delete cascade,
        week_number int,
        sort_order int,
        due_offset_days int,
        required boolean,
        visibility text,
        visible boolean default true,
        notes text,
        created_by uuid,
        updated_by uuid,
        created_at timestamptz not null default now(),
        updated_at timestamptz default now(),
        unique (program_id, template_id)
      );
      create table public.user_roles (
        user_id uuid,
        role_id int references public.roles(role_id)
      );
      create table public.role_permissions (
        role_id int references public.roles(role_id),
        perm_key text
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
        due_date date,
        num_weeks int,
        trainee text,
        notes text,
        updated_at timestamptz default now()
      );
      create table public.orientation_tasks (
        task_id uuid primary key default gen_random_uuid(),
        user_id uuid,
        trainee text,
        label text not null,
        scheduled_for date,
        scheduled_time time,
        due_date date,
        done boolean,
        program_id text,
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
    await pool.query('delete from public.program_template_links');
    await pool.query('delete from public.program_task_templates');
    await pool.query('delete from public.orientation_tasks');
    await pool.query('delete from public.program_memberships');
    await pool.query('delete from public.user_preferences');
    await pool.query('delete from public.programs');
    await pool.query('delete from public.user_roles');
    await pool.query('delete from public.role_permissions');
    await pool.query('delete from public.session');
    await pool.query('delete from public.users');
  });

  test('manager without program permissions cannot create or update programs', async () => {
    const managerId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [managerId, 'mgr', hash, 'local']);
    await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [managerId, 'manager']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'mgr', password: 'passpass' }).expect(200);

    let res = await agent.post('/programs').send({ title: 'T1' }).expect(403);
    expect(res.body.error).toBe('forbidden');

    const progId = 'unauth_prog';
    await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'old', managerId]);
    res = await agent.patch(`/programs/${progId}`).send({ title: 'new' }).expect(403);
    expect(res.body.error).toBe('forbidden');
  });

  test('manager with program.update permission can update managed program', async () => {
    await pool.query("insert into public.role_permissions(role_id, perm_key) select role_id, 'program.update' from public.roles where role_key='manager'");

    const managerId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [managerId, 'mgr2', hash, 'local']);
    await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [managerId, 'manager']);

    const progId = 'managed_prog';
    await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'Old', managerId]);
    await pool.query('insert into public.program_memberships(user_id, program_id, role) values ($1,$2,$3)', [managerId, progId, 'manager']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'mgr2', password: 'passpass' }).expect(200);

    const res = await agent.patch(`/programs/${progId}`).send({ title: 'New' }).expect(200);
    expect(res.body.title).toBe('New');
  });

  test('rejects invalid total_weeks when creating a program', async () => {
    const adminId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [
      adminId,
      'admin-create',
      hash,
      'local'
    ]);
    await pool.query(
      "insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='admin'",
      [adminId]
    );

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'admin-create', password: 'passpass' }).expect(200);

    const countBefore = await pool.query('select count(*)::int as count from public.programs');

    const invalidPayloads = [
      { title: 'Missing weeks' },
      { title: 'Null weeks', total_weeks: null },
      { title: 'Zero weeks', total_weeks: 0 },
      { title: 'Non numeric weeks', total_weeks: 'nope' }
    ];

    for (const payload of invalidPayloads) {
      const res = await agent.post('/programs').send(payload).expect(400);
      expect(['invalid_total_weeks', 'invalid_number']).toContain(res.body.error);
    }

    const countAfter = await pool.query('select count(*)::int as count from public.programs');
    expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);
  });

  test('rejects invalid total_weeks when updating a program', async () => {
    const adminId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [
      adminId,
      'admin-update',
      hash,
      'local'
    ]);
    await pool.query(
      "insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='admin'",
      [adminId]
    );

    const programId = 'update-invalid-total-weeks';
    await pool.query('insert into public.programs(program_id, title, total_weeks, created_by) values ($1,$2,$3,$4)', [
      programId,
      'Existing Program',
      6,
      adminId
    ]);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'admin-update', password: 'passpass' }).expect(200);

    const invalidValues = [null, '', 0, 'nope'];
    for (const value of invalidValues) {
      const res = await agent.patch(`/programs/${programId}`).send({ total_weeks: value }).expect(400);
      expect(['invalid_total_weeks', 'invalid_number']).toContain(res.body.error);
    }

    const { rows } = await pool.query('select total_weeks from public.programs where program_id=$1', [programId]);
    expect(rows[0].total_weeks).toBe(6);
  });

  test('manager with delete permission can soft delete managed program', async () => {
    await pool.query(
      "insert into public.role_permissions(role_id, perm_key) select role_id, 'program.delete' from public.roles where role_key='manager'"
    );

    const managerId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [
      managerId,
      'mgr-delete',
      hash,
      'local'
    ]);
    await pool.query("insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='manager'", [
      managerId
    ]);

    const progId = 'managed_delete_prog';
    await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [
      progId,
      'Delete Me',
      managerId
    ]);
    await pool.query('insert into public.program_memberships(user_id, program_id, role) values ($1,$2,$3)', [
      managerId,
      progId,
      'manager'
    ]);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'mgr-delete', password: 'passpass' }).expect(200);

    await agent.delete(`/programs/${progId}`).expect(200, { deleted: true });

    const { rows } = await pool.query('select deleted_at from public.programs where program_id=$1', [progId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
  });

  test('manager with template delete permission can soft delete managed template', async () => {
    await pool.query(
      "insert into public.role_permissions(role_id, perm_key) select role_id, 'template.delete' from public.roles where role_key='manager'"
    );

    const managerId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [
      managerId,
      'mgr-template-delete',
      hash,
      'local'
    ]);
    await pool.query("insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key='manager'", [
      managerId
    ]);

    const progId = 'managed_template_prog';
    await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [
      progId,
      'Template Delete',
      managerId
    ]);
    await pool.query('insert into public.program_memberships(user_id, program_id, role) values ($1,$2,$3)', [
      managerId,
      progId,
      'manager'
    ]);

    const tmplId = nextTemplateId();
    await pool.query('insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)', [
      tmplId,
      1,
      'Delete Template'
    ]);
    await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
      crypto.randomUUID(),
      tmplId,
      progId,
    ]);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'mgr-template-delete', password: 'passpass' }).expect(200);

    await agent.delete(`/programs/${progId}/templates/${tmplId}`).expect(200, { deleted: true });

    const { rows } = await pool.query('select deleted_at from public.program_task_templates where template_id=$1', [tmplId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
  });

  test('patch updates program fields', async () => {
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user1', hash, 'local']);
    await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

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

  test('program can be soft deleted and restored', async () => {
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('passpass', 1);
    await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user2', hash, 'local']);
    await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username: 'user2', password: 'passpass' }).expect(200);

    const progId = 'prog2';
    await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'TBD', userId]);
    const tmplOne = nextTemplateId();
    const tmplTwo = nextTemplateId();
    await pool.query('insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)', [
      tmplOne,
      1,
      't1'
    ]);
    await pool.query('insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)', [
      tmplTwo,
      2,
      't2'
    ]);
    await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
      crypto.randomUUID(),
      tmplOne,
      progId,
    ]);
    await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
      crypto.randomUUID(),
      tmplTwo,
      progId,
    ]);

    await agent.delete(`/programs/${progId}`).expect(200, { deleted: true });

    let progRows = await pool.query('select deleted_at from public.programs where program_id=$1', [progId]);
    expect(progRows.rowCount).toBe(1);
    expect(progRows.rows[0].deleted_at).not.toBeNull();
    const tmplRows = await pool.query(
      'select 1 from public.program_task_templates t join public.program_template_links l on l.template_id = t.template_id where l.program_id=$1',
      [progId]
    );
    expect(tmplRows.rowCount).toBe(2);

    let res = await agent.get('/programs').expect(200);
    expect(res.body.find(p => p.program_id === progId)).toBeUndefined();

    res = await agent.get('/programs').query({ include_deleted: 'true' }).expect(200);
    const deletedProgram = res.body.find(p => p.program_id === progId);
    expect(deletedProgram).toBeDefined();
    expect(deletedProgram.deleted_at).toBeTruthy();

    await agent.post(`/programs/${progId}/restore`).expect(200, { restored: true });

    progRows = await pool.query('select deleted_at from public.programs where program_id=$1', [progId]);
    expect(progRows.rows[0].deleted_at).toBeNull();

    res = await agent.get('/programs').expect(200);
    const restored = res.body.find(p => p.program_id === progId);
    expect(restored).toBeDefined();
    expect(restored.deleted_at).toBeNull();
  });

test('patch updates template fields', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user3', hash, 'local']);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user3', password: 'passpass' }).expect(200);

  const progId = 'prog3';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = nextTemplateId();
  await pool.query('insert into public.program_task_templates(template_id, week_number, label, notes, sort_order) values ($1,$2,$3,$4,$5)', [
    tmplId,
    1,
    'old',
    'n1',
    1,
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    tmplId,
    progId,
  ]);

  const res = await agent
    .patch(`/programs/${progId}/templates/${tmplId}`)
    .send({ week_number: 2, label: 'new', notes: 'n2', sort_order: 5 })
    .expect(200);

  expect(res.body.week_number).toBe(2);
  expect(res.body.label).toBe('new');
  expect(res.body.notes).toBe('n2');
  expect(res.body.sort_order).toBe(5);

  const { rows: templateRows } = await pool.query(
    'select week_number, label, notes, sort_order from public.program_task_templates where template_id=$1',
    [tmplId]
  );
  expect(templateRows[0]).toEqual({ week_number: 1, label: 'new', notes: 'n1', sort_order: 1 });

  const { rows: linkRows } = await pool.query(
    'select week_number, notes, sort_order from public.program_template_links where template_id=$1 and program_id=$2',
    [tmplId, progId]
  );
  expect(linkRows[0]).toEqual({ week_number: 2, notes: 'n2', sort_order: 5 });
});

test('patch updates template status', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user3c', hash, 'local']);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user3c', password: 'passpass' }).expect(200);

  const progId = 'prog3c';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = nextTemplateId();
  await pool.query('insert into public.program_task_templates(template_id, week_number, label, status) values ($1,$2,$3,$4)', [
    tmplId,
    1,
    'status-old',
    'draft',
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    tmplId,
    progId,
  ]);

  const res = await agent
    .patch(`/programs/${progId}/templates/${tmplId}`)
    .send({ status: 'published' })
    .expect(200);

  expect(res.body.status).toBe('published');

  const { rows } = await pool.query('select status from public.program_task_templates where template_id=$1', [tmplId]);
  expect(rows[0].status).toBe('published');
});

test('patch rejects invalid template status', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user3d', hash, 'local']);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user3d', password: 'passpass' }).expect(200);

  const progId = 'prog3d';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = nextTemplateId();
  await pool.query('insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)', [
    tmplId,
    1,
    'status-invalid',
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    tmplId,
    progId,
  ]);

  const res = await agent
    .patch(`/programs/${progId}/templates/${tmplId}`)
    .send({ status: 'archived' })
    .expect(400);

  expect(res.body.error).toBe('invalid_status');

  const { rows } = await pool.query('select status from public.program_task_templates where template_id=$1', [tmplId]);
  expect(rows[0].status).toBe('draft');
});

test('patch fails for soft deleted template', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user3b', hash, 'local']);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user3b', password: 'passpass' }).expect(200);

  const progId = 'prog3b';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = nextTemplateId();
  await pool.query('insert into public.program_task_templates(template_id, week_number, label, notes, sort_order) values ($1,$2,$3,$4,$5)', [
    tmplId,
    1,
    'old',
    'n1',
    1,
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    tmplId,
    progId,
  ]);

  await agent.delete(`/programs/${progId}/templates/${tmplId}`).expect(200, { deleted: true });

  await agent
    .patch(`/programs/${progId}/templates/${tmplId}`)
    .send({ label: 'new' })
    .expect(404);
});

test('delete soft deletes template row', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user4', hash, 'local']);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user4', password: 'passpass' }).expect(200);

  const progId = 'prog4';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = nextTemplateId();
  await pool.query('insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)', [
    tmplId,
    1,
    'tmp',
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    tmplId,
    progId,
  ]);

  await agent.delete(`/programs/${progId}/templates/${tmplId}`).expect(200, { deleted: true });

  const { rows } = await pool.query('select deleted_at from public.program_task_templates where template_id=$1', [tmplId]);
  expect(rows).toHaveLength(1);
  expect(rows[0].deleted_at).not.toBeNull();

  let res = await agent.get(`/programs/${progId}/templates`).expect(200);
  expect(res.body).toHaveLength(0);

  res = await agent
    .get(`/programs/${progId}/templates`)
    .query({ include_deleted: 'true' })
    .expect(200);
  expect(res.body).toHaveLength(1);
  expect(String(res.body[0].template_id)).toBe(String(tmplId));
  expect(res.body[0].deleted_at).toBeTruthy();
});

test('soft deleted template can be restored', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user4b', hash, 'local']);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user4b', password: 'passpass' }).expect(200);

  const progId = 'prog4b';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = nextTemplateId();
  await pool.query('insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)', [
    tmplId,
    1,
    'tmp',
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    tmplId,
    progId,
  ]);

  await agent.delete(`/programs/${progId}/templates/${tmplId}`).expect(200, { deleted: true });

  await agent.post(`/programs/${progId}/templates/${tmplId}/restore`).expect(200, { restored: true });

  const { rows } = await pool.query('select deleted_at from public.program_task_templates where template_id=$1', [tmplId]);
  expect(rows).toHaveLength(1);
  expect(rows[0].deleted_at).toBeNull();

  const res = await agent.get(`/programs/${progId}/templates`).expect(200);
  expect(res.body).toHaveLength(1);
  expect(String(res.body[0].template_id)).toBe(String(tmplId));
});

test('api program template listing includes external link', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user4b-api', hash, 'local']);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user4b-api', password: 'passpass' }).expect(200);

  const progId = 'prog4b-api';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = nextTemplateId();
  const hyperlink = 'https://example.com/resource';
  await pool.query('insert into public.program_task_templates(template_id, week_number, label, external_link) values ($1,$2,$3,$4)', [
    tmplId,
    1,
    'tmp',
    hyperlink,
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    tmplId,
    progId,
  ]);

  const res = await agent.get(`/api/programs/${progId}/templates`).expect(200);
  expect(Array.isArray(res.body?.data)).toBe(true);
  expect(res.body.data).toHaveLength(1);
  expect(res.body.data[0].external_link).toBe(hyperlink);
  expect(res.body.data[0].hyperlink).toBe(hyperlink);
});

test('legacy program template listing includes hyperlink', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [
    userId,
    'user4b-legacy',
    hash,
    'local',
  ]);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [
    userId,
    'admin',
  ]);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user4b-legacy', password: 'passpass' }).expect(200);

  const progId = 'prog4b-legacy';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = nextTemplateId();
  const hyperlink = 'https://legacy.example.com/resource';
  await pool.query('insert into public.program_task_templates(template_id, week_number, label, external_link) values ($1,$2,$3,$4)', [
    tmplId,
    1,
    'tmp',
    hyperlink,
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    tmplId,
    progId,
  ]);

  const res = await agent.get(`/programs/${progId}/templates`).expect(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].external_link).toBe(hyperlink);
  expect(res.body[0].hyperlink).toBe(hyperlink);
});

test('api program template patch updates hyperlink', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [
    userId,
    'user4b-api-patch',
    hash,
    'local',
  ]);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [
    userId,
    'admin',
  ]);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user4b-api-patch', password: 'passpass' }).expect(200);

  const progId = 'prog4b-api-patch';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const tmplId = nextTemplateId();
  const initialLink = 'https://initial.example.com/resource';
  const newLink = 'https://updated.example.com/resource';
  await pool.query('insert into public.program_task_templates(template_id, week_number, label, external_link) values ($1,$2,$3,$4)', [
    tmplId,
    1,
    'tmp',
    initialLink,
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    tmplId,
    progId,
  ]);

  const patchRes = await agent
    .patch(`/api/programs/${progId}/templates/${tmplId}`)
    .send({ hyperlink: newLink })
    .expect(200);

  expect(patchRes.body.updated).toBe(true);
  expect(patchRes.body.template).toBeDefined();
  expect(patchRes.body.template.external_link).toBe(newLink);
  expect(patchRes.body.template.hyperlink).toBe(newLink);

  const listRes = await agent.get(`/api/programs/${progId}/templates`).expect(200);
  expect(Array.isArray(listRes.body?.data)).toBe(true);
  const [linked] = listRes.body.data;
  expect(String(linked.template_id)).toBe(String(tmplId));
  expect(linked.external_link).toBe(newLink);
  expect(linked.hyperlink).toBe(newLink);
});

test('instantiate skips soft deleted templates', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)', [userId, 'user4c', hash, 'local', 'Test User']);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'user4c', password: 'passpass' }).expect(200);

  const progId = 'prog4c';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [progId, 'title', userId]);
  const activeId = nextTemplateId();
  const deletedId = nextTemplateId();
  await pool.query('insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)', [
    activeId,
    1,
    'active',
  ]);
  await pool.query('insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)', [
    deletedId,
    2,
    'deleted',
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    activeId,
    progId,
  ]);
  await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
    crypto.randomUUID(),
    deletedId,
    progId,
  ]);

  await agent.delete(`/programs/${progId}/templates/${deletedId}`).expect(200, { deleted: true });

  const res = await agent.post(`/programs/${progId}/instantiate`).expect(200);
  expect(res.body.created).toBe(1);

  const { rows } = await pool.query('select label from public.orientation_tasks where user_id=$1', [userId]);
  expect(rows).toHaveLength(1);
  expect(rows[0].label).toBe('active');
});

test('rbac instantiate applies scheduling metadata', async () => {
  const adminId = crypto.randomUUID();
  const adminHash = await bcrypt.hash('passpass', 1);
  await pool.query(
    'insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)',
    [adminId, 'admin-assign', adminHash, 'local', 'Admin User'],
  );
  await pool.query(
    'insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2',
    [adminId, 'admin'],
  );

  const assigneeId = crypto.randomUUID();
  await pool.query(
    'insert into public.users(id, username, password_hash, provider, full_name) values ($1,$2,$3,$4,$5)',
    [assigneeId, 'assignee', adminHash, 'local', 'Trainee User'],
  );

  const agent = request.agent(app);
  await agent.post('/auth/local/login').send({ username: 'admin-assign', password: 'passpass' }).expect(200);

  const progId = 'sched-prog';
  await pool.query('insert into public.programs(program_id, title, created_by) values ($1,$2,$3)', [
    progId,
    'Scheduled Program',
    adminId,
  ]);

  const tmplId = nextTemplateId();
  await pool.query(
    'insert into public.program_task_templates(template_id, week_number, label, notes, due_offset_days) values ($1,$2,$3,$4,$5)',
    [tmplId, 1, 'Orientation call', 'Template note', 3],
  );
  await pool.query(
    'insert into public.program_template_links(id, template_id, program_id, due_offset_days) values ($1,$2,$3,$4)',
    [crypto.randomUUID(), tmplId, progId, 2],
  );

  const startDate = '2024-02-01';
  const dueDate = '2024-02-28';
  const assignmentNotes = 'Check in weekly';

  const res = await agent
    .post(`/rbac/users/${assigneeId}/programs/${progId}/instantiate`)
    .send({ startDate, dueDate, notes: assignmentNotes })
    .expect(200);

  expect(res.body).toMatchObject({ ok: true, created: 1 });

  const taskRows = await pool.query(
    'select program_id, scheduled_for, due_date, notes from public.orientation_tasks where user_id=$1',
    [assigneeId],
  );
  expect(taskRows.rows).toHaveLength(1);
  const task = taskRows.rows[0];
  const toDateString = value => (value instanceof Date ? value.toISOString().slice(0, 10) : value);
  expect(task.program_id).toBe(progId);
  expect(toDateString(task.scheduled_for)).toBe(startDate);
  expect(toDateString(task.due_date)).toBe(dueDate);
  expect(task.notes).toBe('Template note\n\nCheck in weekly');

  const prefs = await pool.query(
    'select program_id, start_date, due_date, num_weeks, notes from public.user_preferences where user_id=$1',
    [assigneeId],
  );
  expect(prefs.rows).toHaveLength(1);
  const pref = prefs.rows[0];
  expect(pref.program_id).toBe(progId);
  expect(toDateString(pref.start_date)).toBe(startDate);
  expect(toDateString(pref.due_date)).toBe(dueDate);
  expect(pref.notes).toBe(assignmentNotes);
  expect(pref.num_weeks).toBe(4);
});

test('deleted task can be restored', async () => {
  const userId = crypto.randomUUID();
  const hash = await bcrypt.hash('passpass', 1);
  await pool.query('insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)', [userId, 'user5', hash, 'local']);
  await pool.query('insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key=$2', [userId, 'admin']);

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

  // program should still be returned by GET /programs
  res = await agent.get('/programs').expect(200);
  expect(res.body.find(p => p.program_id === progId)).toBeDefined();
});
});
