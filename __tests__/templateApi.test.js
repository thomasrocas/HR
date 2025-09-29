const fs = require('fs');
const path = require('path');
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

const addExternalLinkMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '017_add_external_link_to_program_template_links.sql'),
  'utf-8'
);

const addTypeDeliveryMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '019_add_type_delivery_to_links_and_tasks.sql'),
  'utf-8'
);

const DEFAULT_PASSWORD = 'passpass';

describe('template api', () => {
  beforeAll(async () => {
    await pool.query(`
      create table public.users (
        id uuid primary key,
        username text unique,
        email text,
        full_name text,
        status text default 'active' not null,
        password_hash text,
        provider text,
        organization_id text,
        organization text,
        hire_date date,
        discipline text,
        discipline_type text,
        last_name text,
        surname text,
        first_name text,
        department text,
        sub_unit text,
        role text,
        google_id text,
        picture_url text,
        created_at timestamptz,
        updated_at timestamptz,
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
        results text,
        purpose text,
        organization text,
        sub_unit text,
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
        discipline_type text,
        type_delivery text,
        department text,
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
        external_link text,
        type_delivery text,
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
      create table public.orientation_tasks (
        task_id uuid primary key default gen_random_uuid(),
        user_id uuid,
        label text,
        type_delivery text
      );
      insert into public.roles(role_key) values ('admin'), ('manager'), ('viewer'), ('trainee'), ('auditor');
    `);
    await pool.query(addExternalLinkMigration);
    await pool.query(addTypeDeliveryMigration);
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

  const createUserWithRole = async (username, roleKey, overrides = {}) => {
    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 1);
    await pool.query(
      'insert into public.users(id, username, password_hash, provider) values ($1,$2,$3,$4)',
      [userId, username, passwordHash, 'local']
    );
    const entries = Object.entries(overrides || {});
    if (entries.length) {
      const setClauses = entries.map(([key], index) => `${key} = $${index + 2}`);
      const values = [userId, ...entries.map(([, value]) => value)];
      await pool.query(`update public.users set ${setClauses.join(', ')} where id = $1`, values);
    }
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

  test('GET /api/templates restricts managers to their organization', async () => {
    await grantPermission('template.read');
    const managerUsername = 'manager-templates';
    const organizationId = 'org-manager-1';
    await createUserWithRole(managerUsername, 'manager', {
      role: 'manager',
      organization_id: organizationId,
    });

    const templateRows = [
      { id: nextTemplateId(), label: 'Manager Org Template', organization: organizationId },
      { id: nextTemplateId(), label: 'Other Org Template', organization: 'other-org' },
      { id: nextTemplateId(), label: 'No Org Template', organization: null },
    ];

    for (const row of templateRows) {
      await pool.query(
        'insert into public.program_task_templates(template_id, week_number, label, organization, status) values ($1,$2,$3,$4,$5)',
        [row.id, 1, row.label, row.organization, 'draft']
      );
    }

    const agent = await loginAgent(managerUsername);

    const res = await agent.get('/api/templates').expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].organization).toBe(organizationId);

    const resWithQuery = await agent
      .get('/api/templates')
      .query({ organization: 'other-org' })
      .expect(200);
    expect(resWithQuery.body.data).toEqual(res.body.data);
  });

  test('GET /api/templates restricts managers assigned only via user_roles', async () => {
    await grantPermission('template.read');
    const managerUsername = 'manager-templates-user-roles';
    const organizationId = 'org-manager-roles';
    await createUserWithRole(managerUsername, 'manager', {
      organization_id: organizationId,
    });

    const templateRows = [
      { id: nextTemplateId(), label: 'Roles Manager Template', organization: organizationId },
      { id: nextTemplateId(), label: 'Other Org Template', organization: 'other-org' },
    ];

    for (const row of templateRows) {
      await pool.query(
        'insert into public.program_task_templates(template_id, week_number, label, organization, status) values ($1,$2,$3,$4,$5)',
        [row.id, 1, row.label, row.organization, 'draft']
      );
    }

    const agent = await loginAgent(managerUsername);

    const res = await agent.get('/api/templates').expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].organization).toBe(organizationId);

    const resWithQuery = await agent
      .get('/api/templates')
      .query({ organization: 'other-org' })
      .expect(200);
    expect(resWithQuery.body.data).toEqual(res.body.data);
  });

  test('GET /api/templates allows admins to filter by organization', async () => {
    const adminUsername = 'admin-templates-org';
    await createUserWithRole(adminUsername, 'admin', { role: 'admin' });

    const targetOrg = 'filter-org';
    const templateRows = [
      { id: nextTemplateId(), label: 'Target Org Template', organization: targetOrg },
      { id: nextTemplateId(), label: 'Other Org Template', organization: 'other-org' },
    ];

    for (const row of templateRows) {
      await pool.query(
        'insert into public.program_task_templates(template_id, week_number, label, organization, status) values ($1,$2,$3,$4,$5)',
        [row.id, 1, row.label, row.organization, 'draft']
      );
    }

    const agent = await loginAgent(adminUsername);

    const res = await agent
      .get('/api/templates')
      .query({ organization: targetOrg })
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].organization).toBe(targetOrg);
    expect(res.body.meta.total).toBe(1);
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

  test('restoring archived program template returns it to listings', async () => {
    const adminUsername = 'admin-program-template-restore';
    await createUserWithRole(adminUsername, 'admin');
    const agent = await loginAgent(adminUsername);

    const programId = 'program-restore-list';
    await pool.query('insert into public.programs(program_id, title) values ($1,$2)', [
      programId,
      'Restore Program',
    ]);

    const templateId = nextTemplateId();
    await pool.query(
      'insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)',
      [templateId, 1, 'Program Restore Template'],
    );
    await pool.query('insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)', [
      crypto.randomUUID(),
      templateId,
      programId,
    ]);

    await agent.delete(`/programs/${programId}/templates/${templateId}`).expect(200, { deleted: true });

    const afterDelete = await agent.get(`/programs/${programId}/templates`).expect(200);
    expect(afterDelete.body).toEqual([]);

    const withDeleted = await agent
      .get(`/programs/${programId}/templates`)
      .query({ include_deleted: 'true' })
      .expect(200);
    const archivedRow = withDeleted.body.find(row => String(row.template_id) === String(templateId));
    expect(archivedRow).toBeDefined();
    expect(archivedRow.deleted_at).not.toBeNull();

    await agent
      .post(`/programs/${programId}/templates/${templateId}/restore`)
      .expect(200, { restored: true });

    const afterRestore = await agent.get(`/programs/${programId}/templates`).expect(200);
    expect(Array.isArray(afterRestore.body)).toBe(true);
    const restoredRow = afterRestore.body.find(row => String(row.template_id) === String(templateId));
    expect(restoredRow).toBeDefined();
    expect(restoredRow.deleted_at).toBeNull();

    const { rows } = await pool.query(
      'select deleted_at from public.program_task_templates where template_id=$1',
      [templateId],
    );
    expect(rows[0]?.deleted_at).toBeNull();
  });

  test('publishing a program with archived templates clears deleted_at via restore API', async () => {
    const adminUsername = 'admin-program-publish-restore';
    await createUserWithRole(adminUsername, 'admin');
    const agent = await loginAgent(adminUsername);

    const programId = 'program-publish-restore';
    await pool.query('insert into public.programs(program_id, title) values ($1,$2)', [
      programId,
      'Publish Program',
    ]);

    const templateId = nextTemplateId();
    await pool.query(
      'insert into public.program_task_templates(template_id, week_number, label) values ($1,$2,$3)',
      [templateId, 1, 'Publish Flow Template'],
    );
    await pool.query(
      'insert into public.program_template_links(id, template_id, program_id) values ($1,$2,$3)',
      [crypto.randomUUID(), templateId, programId],
    );

    await agent.delete(`/programs/${programId}/templates/${templateId}`).expect(200, { deleted: true });

    const { rows: deletedRows } = await pool.query(
      'select deleted_at from public.program_task_templates where template_id=$1',
      [templateId],
    );
    expect(deletedRows[0]?.deleted_at).not.toBeNull();

    await agent.post(`/api/programs/${programId}/publish`).expect(200, { published: true });

    const includeDeleted = await agent
      .get(`/programs/${programId}/templates`)
      .query({ include_deleted: 'true' })
      .expect(200);
    const archivedTemplate = includeDeleted.body.find(
      row => String(row.template_id) === String(templateId) && row.deleted_at,
    );
    expect(archivedTemplate).toBeDefined();

    await agent.post(`/programs/${programId}/templates/${templateId}/restore`).expect(200, {
      restored: true,
    });

    const { rows: restoredRows } = await pool.query(
      'select deleted_at from public.program_task_templates where template_id=$1',
      [templateId],
    );
    expect(restoredRows[0]?.deleted_at).toBeNull();
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
      .post('/api/programs/attach-program/templates')
      .send({ template_id: templateId })
      .expect(201);
    expect(attachRes.body.attached).toBe(true);
    expect(attachRes.body.alreadyAttached).toBe(false);
    expect(attachRes.body.template).toMatchObject({
      week_number: 3,
      notes: 'Be prepared',
      due_offset_days: 5,
      required: true,
      visibility: 'managers',
      sort_order: 4,
    });
    expect(String(attachRes.body.template.template_id)).toBe(String(templateId));

    attachRes = await managerAgent
      .post('/api/programs/attach-program/templates')
      .send({ templateId })
      .expect(200);
    expect(attachRes.body.alreadyAttached).toBe(true);

    await otherManagerAgent
      .post('/api/programs/attach-program/templates')
      .send({ template_id: templateId })
      .expect(403);

    let detachRes = await managerAgent
      .delete(`/api/programs/attach-program/templates/${templateId}`)
      .expect(200);
    expect(detachRes.body.detached).toBe(true);
    expect(detachRes.body.wasAttached).toBe(true);

    detachRes = await managerAgent
      .delete(`/api/programs/attach-program/templates/${templateId}`)
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


  test('PATCH /api/programs/:programId/templates/:templateId updates metadata with RBAC enforcement', async () => {
    await grantPermission('template.update');

    const managerUsername = 'manager-metadata';
    const managerId = await createUserWithRole(managerUsername, 'manager');
    const otherManagerUsername = 'manager-metadata-no-access';
    await createUserWithRole(otherManagerUsername, 'manager');

    const programId = 'metadata-program';
    await pool.query('insert into public.programs(program_id, title) values ($1,$2)', [programId, 'Metadata Program']);
    await pool.query('insert into public.program_memberships(user_id, program_id, role) values ($1,$2,$3)', [
      managerId,
      programId,
      'manager',
    ]);

    const templateId = nextTemplateId();
    await pool.query(
      'insert into public.program_task_templates(template_id, label, notes, due_offset_days, required, status) values ($1,$2,$3,$4,$5,$6)',
      [templateId, 'Metadata Template', 'Old notes', 1, false, 'draft']
    );
    await pool.query('insert into public.program_template_links(template_id, program_id) values ($1,$2)', [
      templateId,
      programId,
    ]);

    const managerAgent = await loginAgent(managerUsername);
    const otherManagerAgent = await loginAgent(otherManagerUsername);

    await otherManagerAgent
      .patch(`/api/programs/${programId}/templates/${templateId}`)
      .send({ notes: 'No access' })
      .expect(403);

    const patchRes = await managerAgent
      .patch(`/api/programs/${programId}/templates/${templateId}`)
      .send({ notes: 'Updated notes', due_offset_days: 5, required: true, status: 'published' })
      .expect(200);

    expect(patchRes.body.updated).toBe(true);
    expect(patchRes.body.template).toMatchObject({
      notes: 'Updated notes',
      due_offset_days: 5,
      required: true,
      status: 'published',
      program_id: programId,
    });

    const { rows } = await pool.query(
      'select notes, due_offset_days, required, status from public.program_task_templates where template_id = $1',
      [templateId]
    );
    expect(rows[0]).toMatchObject({
      notes: 'Updated notes',
      due_offset_days: 5,
      required: true,
      status: 'published',
    });

    await managerAgent
      .patch(`/api/programs/${programId}/templates/${templateId}`)
      .send({ status: 'invalid-status' })
      .expect(400);

  });
});
