const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { newDb } = require('pg-mem');

const nextTemplateId = (() => {
  let value = 2000;
  return () => ++value;
})();

const db = newDb();
const { Pool: MockPool } = db.adapters.createPg();
db.public.registerFunction({
  name: 'gen_random_uuid',
  returns: 'uuid',
  implementation: () => crypto.randomUUID(),
});
db.public.registerFunction({
  name: 'to_timestamp',
  args: ['text'],
  returns: 'timestamptz',
  implementation: value => new Date(Number(value) * 1000),
});

jest.mock('pg', () => ({ Pool: MockPool }));

const { app, pool } = require('../orientation_server.js');

const DEFAULT_PASSWORD = 'passpass';

describe('template api', () => {
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
        due_offset_days int,
        required boolean,
        visibility text,
        sort_order int,
        status text default 'draft',
        deleted_at timestamp
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
      insert into public.roles(role_key) values ('admin'), ('manager'), ('viewer'), ('trainee'), ('auditor');
    `);
  });

  afterEach(async () => {
    await pool.query('delete from public.program_template_links');
    await pool.query('delete from public.program_task_templates');
    await pool.query('delete from public.program_memberships');
    await pool.query('delete from public.programs');
    await pool.query('delete from public.user_roles');
    await pool.query('delete from public.role_permissions');
    await pool.query('delete from public.session');
    await pool.query('delete from public.users');
  });

  const createUserWithRole = async (username, roleKey) => {
    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 1);
    await pool.query(
      'insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)',
      [userId, username, passwordHash, 'local']
    );
    if (roleKey) {
      await pool.query(
        'insert into public.user_roles(user_id, role_id) select $1, role_id from public.roles where role_key = $2',
        [userId, roleKey]
      );
    }
    return userId;
  };

  const loginAgent = async username => {
    const agent = request.agent(app);
    await agent.post('/auth/local/login').send({ username, password: DEFAULT_PASSWORD }).expect(200);
    return agent;
  };

  const grantPermission = async permKey => {
    await pool.query(
      'insert into public.role_permissions(role_id, perm_key) select role_id, $1 from public.roles where role_key = $2',
      [permKey, 'manager']
    );
  };

  test('GET /api/templates supports pagination and filtering', async () => {
    const adminUsername = 'admin-templates';
    await createUserWithRole(adminUsername, 'admin');

    for (let i = 0; i < 6; i += 1) {
      const templateId = nextTemplateId();
      const status = i % 2 === 0 ? 'draft' : 'published';
      await pool.query(
        'insert into public.program_task_templates(template_id, week_number, label, notes, sort_order, status) values ($1,$2,$3,$4,$5,$6)',
        [templateId, i + 1, `Template ${i}`, `Notes ${i}`, i, status]
      );
    }
    const deletedId = nextTemplateId();
    await pool.query(
      'insert into public.program_task_templates(template_id, week_number, label, status, deleted_at) values ($1,$2,$3,$4, now())',
      [deletedId, 7, 'Deleted Template', 'draft']
    );

    const agent = await loginAgent(adminUsername);

    const res = await agent
      .get('/api/templates')
      .query({ limit: 2, offset: 1, status: 'draft', search: 'Template' })
      .expect(200);

    expect(res.body.meta).toMatchObject({ limit: 2, offset: 1 });
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    res.body.data.forEach(item => {
      expect(item.status).toBe('draft');
      expect(item.label).toMatch(/Template/);
    });

    const includeDeleted = await agent
      .get('/api/templates')
      .query({ include_deleted: 'true', status: 'draft' })
      .expect(200);

    const hasDeleted = includeDeleted.body.data.some(row => row.label === 'Deleted Template');
    expect(hasDeleted).toBe(true);

    await agent.get('/api/templates').query({ status: 'invalid' }).expect(400);
  });

  test('POST /api/templates enforces validation rules', async () => {
    const adminUsername = 'admin-create';
    await createUserWithRole(adminUsername, 'admin');
    const agent = await loginAgent(adminUsername);

    await agent.post('/api/templates').send({ label: '' }).expect(400);
    await agent.post('/api/templates').send({ label: 'Week', week_number: 'abc' }).expect(400);
    await agent.post('/api/templates').send({ label: 'Week', sort_order: 'abc' }).expect(400);
    await agent.post('/api/templates').send({ label: 'Week', status: 'archived' }).expect(400);

    const res = await agent
      .post('/api/templates')
      .send({ label: 'New Template', week_number: 1, notes: 'Intro', sort_order: 3, status: 'published' })
      .expect(201);

    expect(res.body.label).toBe('New Template');
    expect(res.body.status).toBe('published');

    const { rows } = await pool.query('select label, status from public.program_task_templates where label = $1', [
      'New Template',
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('published');
  });

  test('PATCH /api/templates updates editable fields', async () => {
    const adminUsername = 'admin-update';
    await createUserWithRole(adminUsername, 'admin');
    const agent = await loginAgent(adminUsername);

    const templateId = nextTemplateId();
    await pool.query(
      'insert into public.program_task_templates(template_id, week_number, label, notes, sort_order, status) values ($1,$2,$3,$4,$5,$6)',
      [templateId, 1, 'Initial', 'Start', 1, 'draft']
    );

    const res = await agent
      .patch(`/api/templates/${templateId}`)
      .send({ label: 'Updated', week_number: 2, sort_order: 5, notes: 'Updated notes', status: 'published' })
      .expect(200);

    expect(res.body.label).toBe('Updated');
    expect(res.body.week_number).toBe(2);
    expect(res.body.sort_order).toBe(5);
    expect(res.body.status).toBe('published');

    await agent
      .patch(`/api/templates/${templateId}`)
      .send({ status: 'archived' })
      .expect(400);
  });

  test('DELETE and restore templates toggle soft delete flag', async () => {
    const adminUsername = 'admin-delete';
    await createUserWithRole(adminUsername, 'admin');
    const agent = await loginAgent(adminUsername);

    const templateId = nextTemplateId();
    await pool.query(
      'insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)',
      [templateId, 1, 'Soft Delete']
    );

    await agent.delete(`/api/templates/${templateId}`).expect(200, { deleted: true });

    let { rows } = await pool.query('select deleted_at from public.program_task_templates where template_id=$1', [templateId]);
    expect(rows[0].deleted_at).not.toBeNull();

    await agent.post(`/api/templates/${templateId}/restore`).expect(200, { restored: true });

    ({ rows } = await pool.query('select deleted_at from public.program_task_templates where template_id=$1', [templateId]));
    expect(rows[0].deleted_at).toBeNull();
  });

  test('listing template program associations returns attached programs', async () => {
    const adminUsername = 'admin-list-programs';
    await createUserWithRole(adminUsername, 'admin');
    const agent = await loginAgent(adminUsername);

    const programId = 'program-list';
    await pool.query('insert into public.programs(program_id, title) values ($1,$2)', [programId, 'Program']);

    const templateOne = nextTemplateId();
    const templateTwo = nextTemplateId();
    await pool.query('insert into public.program_task_templates(template_id, label) values ($1,$2)', [
      templateOne,
      'Template One',
    ]);
    await pool.query('insert into public.program_task_templates(template_id, label, status) values ($1,$2,$3)', [
      templateTwo,
      'Template Two',
      'published',
    ]);
    await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
      crypto.randomUUID(),
      templateOne,
      programId,
    ]);
    await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
      crypto.randomUUID(),
      templateTwo,
      programId,
    ]);

    const programTemplates = await agent
      .get(`/api/programs/${programId}/templates`)
      .query({ limit: 1 })
      .expect(200);

    expect(programTemplates.body.meta.total).toBe(2);
    expect(programTemplates.body.data.length).toBe(1);

    const templatePrograms = await agent
      .get(`/api/templates/${templateOne}/programs`)
      .query({ limit: 5 })
      .expect(200);

    expect(templatePrograms.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ program_id: programId, title: 'Program' }),
      ])
    );
  });

  test('attach and detach enforce RBAC and remain idempotent', async () => {
    const adminUsername = 'admin-attach';
    await createUserWithRole(adminUsername, 'admin');
    const adminAgent = await loginAgent(adminUsername);

    await grantPermission('template.update');

    const managerUsername = 'manager-attach';
    const managerId = await createUserWithRole(managerUsername, 'manager');
    await pool.query('insert into public.program_memberships(user_id, program_id, role) values ($1,$2,$3)', [
      managerId,
      'attach-program',
      'manager',
    ]);

    const otherManagerUsername = 'manager-no-access';
    await createUserWithRole(otherManagerUsername, 'manager');

    await pool.query('insert into public.programs(program_id, title) values ($1,$2)', [
      'attach-program',
      'Attach Program',
    ]);
    const templateId = nextTemplateId();
    await pool.query(
      'insert into public.program_task_templates(template_id, week_number, label, notes, due_offset_days, required, visibility, sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [templateId, 3, 'Attach Template', 'Be prepared', 5, true, 'managers', 4]
    );

    const managerAgent = await loginAgent(managerUsername);
    const otherManagerAgent = await loginAgent(otherManagerUsername);

    let attachRes = await managerAgent
      .post('/api/programs/attach-program/templates/attach')
      .send({ template_id: templateId })
      .expect(200);
    expect(attachRes.body.attached).toBe(true);
    expect(attachRes.body.alreadyAttached).toBe(false);
    expect(attachRes.body.template).toMatchObject({
      program_id: 'attach-program',
      week_number: 3,
      notes: 'Be prepared',
      due_offset_days: 5,
      required: true,
      visibility: 'managers',
      visible: true,
      sort_order: 4,
    });
    expect(attachRes.body.template.link_id).toBeTruthy();
    expect(String(attachRes.body.template.template_id)).toBe(String(templateId));

    attachRes = await managerAgent
      .post('/api/programs/attach-program/templates/attach')
      .send({ templateId })
      .expect(200);
    expect(attachRes.body.alreadyAttached).toBe(true);

    await otherManagerAgent
      .post('/api/programs/attach-program/templates/attach')
      .send({ template_id: templateId })
      .expect(403);

    let detachRes = await managerAgent
      .post('/api/programs/attach-program/templates/detach')
      .send({ template_id: templateId })
      .expect(200);
    expect(detachRes.body.detached).toBe(true);
    expect(detachRes.body.wasAttached).toBe(true);

    detachRes = await managerAgent
      .post('/api/programs/attach-program/templates/detach')
      .send({ template_id: templateId })
      .expect(200);
    expect(detachRes.body.wasAttached).toBe(false);

    const { rows } = await pool.query(
      'select 1 from public.program_template_links where template_id=$1 and program_id=$2',
      [templateId, 'attach-program']
    );
    expect(rows).toHaveLength(0);

    const programList = await adminAgent
      .get('/api/programs/attach-program/templates')
      .query({ include_deleted: 'true' })
      .expect(200);
    expect(programList.body.meta.total).toBe(0);
  });

  test('link metadata updates apply to a single program', async () => {
    const adminUsername = 'admin-link-meta';
    const adminId = await createUserWithRole(adminUsername, 'admin');
    await grantPermission('template.update');
    const adminAgent = await loginAgent(adminUsername);

    await pool.query('insert into public.programs(program_id, title) values ($1,$2), ($3,$4)', [
      'link-program-a',
      'Program A',
      'link-program-b',
      'Program B',
    ]);
    const templateId = nextTemplateId();
    await pool.query(
      'insert into public.program_task_templates(template_id, week_number, label, notes, due_offset_days, required, visibility, sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [templateId, 2, 'Shareable Template', 'Base notes', 3, false, 'everyone', 2]
    );

    await adminAgent
      .post('/api/programs/link-program-a/templates/attach')
      .send({ template_id: templateId })
      .expect(200);
    await adminAgent
      .post('/api/programs/link-program-b/templates/attach')
      .send({ template_id: templateId })
      .expect(200);

    const patchResponse = await adminAgent
      .patch('/programs/link-program-a/templates/metadata')
      .send({
        updates: [
          {
            template_id: templateId,
            due_offset_days: 9,
            notes: 'Only for program A',
            visibility: 'admins',
            week_number: 5,
          },
        ],
      })
      .expect(200);
    expect(patchResponse.body).toEqual({ updated: 1 });

    const programAResponse = await adminAgent
      .get('/api/programs/link-program-a/templates')
      .expect(200);
    const assignmentA = programAResponse.body.data.find(row => String(row.template_id) === String(templateId));
    expect(assignmentA).toMatchObject({
      program_id: 'link-program-a',
      due_offset_days: 9,
      notes: 'Only for program A',
      visibility: 'admins',
      week_number: 5,
    });

    const programBResponse = await adminAgent
      .get('/api/programs/link-program-b/templates')
      .expect(200);
    const assignmentB = programBResponse.body.data.find(row => String(row.template_id) === String(templateId));
    expect(assignmentB).toMatchObject({
      program_id: 'link-program-b',
      due_offset_days: 3,
      notes: 'Base notes',
      visibility: 'everyone',
      week_number: 2,
    });

    const { rows: linkRows } = await pool.query(
      'select due_offset_days, notes, visibility, week_number, updated_by from public.program_template_links where program_id = $1 and template_id = $2',
      ['link-program-a', templateId]
    );
    expect(linkRows[0]).toMatchObject({
      due_offset_days: 9,
      notes: 'Only for program A',
      visibility: 'admins',
      week_number: 5,
      updated_by: adminId,
    });

    const { rows: otherLinkRows } = await pool.query(
      'select due_offset_days, notes, visibility, week_number from public.program_template_links where program_id = $1 and template_id = $2',
      ['link-program-b', templateId]
    );
    expect(otherLinkRows[0]).toMatchObject({
      due_offset_days: 3,
      notes: 'Base notes',
      visibility: 'everyone',
      week_number: 2,
    });
  });
});
