-- 002_rbac.sql (patched)
-- Role-based access control and auditing
-- Idempotent: safe to re-run. Includes legacy cleanup and guarded seeds.

-- === 1. Tables ===

-- Roles
create table if not exists roles (
  role_id serial primary key,
  role_key text unique,
  description text
);

-- Permissions
create table if not exists permissions (
  perm_key text primary key,
  description text
);

-- User roles (many-to-many users<->roles)
create table if not exists user_roles (
  user_id uuid references public.users(id) on delete cascade,
  role_id int references roles(role_id) on delete cascade,
  primary key (user_id, role_id)
);

-- Role permissions (many-to-many roles<->permissions)
create table if not exists role_permissions (
  role_id int references roles(role_id) on delete cascade,
  perm_key text references permissions(perm_key) on delete cascade,
  primary key (role_id, perm_key)
);

-- Program memberships (who manages or views programs)
create table if not exists program_memberships (
  user_id uuid references public.users(id) on delete cascade,
  program_id text references public.programs(program_id) on delete cascade,
  role text not null,
  created_at timestamptz default now(),
  primary key (user_id, program_id, role)
);

-- Audit log table
create table if not exists audit_log (
  audit_id bigserial primary key,
  table_name text not null,
  operation text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz default now(),
  changed_by text
);

-- === 2. Audit trigger function ===
create or replace function audit_trigger() returns trigger as $$
declare
  app_user text := current_setting('app.current_user', true);
  rec_id text;
begin
  rec_id := coalesce(
    (new).id::text,
    (new).task_id::text,
    (old).id::text,
    (old).task_id::text
  );

  if (TG_OP = 'DELETE') then
    insert into audit_log(table_name, operation, record_id, old_data, changed_by)
    values (TG_TABLE_NAME, TG_OP, rec_id, to_jsonb(old), app_user);
    return old;
  elsif (TG_OP = 'UPDATE') then
    insert into audit_log(table_name, operation, record_id, old_data, new_data, changed_by)
    values (TG_TABLE_NAME, TG_OP, rec_id, to_jsonb(old), to_jsonb(new), app_user);
    return new;
  elsif (TG_OP = 'INSERT') then
    insert into audit_log(table_name, operation, record_id, new_data, changed_by)
    values (TG_TABLE_NAME, TG_OP, rec_id, to_jsonb(new), app_user);
    return new;
  end if;
  return null;
end;
$$ language plpgsql;

-- =========================================================
-- PATCH A: Normalize role_permissions to use perm_key (text)
-- Handles legacy installs where a NOT NULL perm_id column exists.
-- =========================================================
do $$
begin
  -- If legacy perm_id column exists, remove it and align to perm_key
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='role_permissions' and column_name='perm_id'
  ) then
    -- drop constraints that may reference perm_id
    begin
      alter table public.role_permissions drop constraint if exists role_permissions_pkey;
    exception when undefined_object then null; end;

    begin
      alter table public.role_permissions drop constraint if exists role_permissions_perm_id_fkey;
    exception when undefined_object then null; end;

    alter table public.role_permissions drop column if exists perm_id;
  end if;

  -- ensure perm_key column exists
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='role_permissions' and column_name='perm_key'
  ) then
    alter table public.role_permissions add column perm_key text;
  end if;

  -- (re)add FK to permissions(perm_key)
  begin
    alter table public.role_permissions
      add constraint role_permissions_perm_key_fkey
      foreign key (perm_key) references public.permissions(perm_key) on delete cascade;
  exception when duplicate_object then null; end;

  -- (re)add PK on (role_id, perm_key)
  begin
    alter table public.role_permissions
      add constraint role_permissions_pkey primary key (role_id, perm_key);
  exception when duplicate_object then null; end;
end $$;

-- =========================================================
-- PATCH B: Make triggers idempotent (drop-if-exists then create)
-- =========================================================

-- orientation_tasks
drop trigger if exists audit_orientation_tasks on public.orientation_tasks;
create trigger audit_orientation_tasks
after insert or update or delete on public.orientation_tasks
for each row execute function audit_trigger();

-- programs
drop trigger if exists audit_programs on public.programs;
create trigger audit_programs
after insert or update or delete on public.programs
for each row execute function audit_trigger();

-- program_task_templates
drop trigger if exists audit_program_task_templates on public.program_task_templates;
create trigger audit_program_task_templates
after insert or update or delete on public.program_task_templates
for each row execute function audit_trigger();

-- program_memberships
drop trigger if exists audit_program_memberships on public.program_memberships;
create trigger audit_program_memberships
after insert or update or delete on public.program_memberships
for each row execute function audit_trigger();

-- === 4. Seed data ===
-- Default roles
insert into roles(role_key, description) values
  ('admin',   'Superuser with all permissions'),
  ('manager', 'Program manager'),
  ('viewer',  'Read-only access'),
  ('trainee', 'Trainee user'),
  ('auditor', 'Audit log reader')
on conflict do nothing;

-- Default permissions
insert into permissions(perm_key, description) values
  ('program.create',  'Create programs'),
  ('program.read',    'View programs'),
  ('program.update',  'Edit programs'),
  ('program.delete',  'Delete programs'),
  ('template.create', 'Create templates'),
  ('template.read',   'View templates'),
  ('template.update', 'Edit templates'),
  ('template.delete', 'Delete templates'),
  ('task.create',     'Create tasks'),
  ('task.update',     'Edit tasks'),
  ('task.delete',     'Delete tasks')
on conflict do nothing;

-- Role permissions mapping
insert into role_permissions(role_id, perm_key)
select r.role_id, p.perm_key from (
  values
    ('admin',   'program.create'),
    ('admin',   'program.read'),
    ('admin',   'program.update'),
    ('admin',   'program.delete'),
    ('admin',   'template.create'),
    ('admin',   'template.read'),
    ('admin',   'template.update'),
    ('admin',   'template.delete'),
    ('admin',   'task.create'),
    ('admin',   'task.update'),
    ('admin',   'task.delete'),
    ('manager', 'program.create'),
    ('manager', 'program.read'),
    ('manager', 'program.update'),
    ('manager', 'program.delete'),
    ('manager', 'template.create'),
    ('manager', 'template.read'),
    ('manager', 'template.update'),
    ('manager', 'template.delete'),
    ('manager', 'task.create'),
    ('manager', 'task.update'),
    ('manager', 'task.delete'),
    ('viewer',  'program.read'),
    ('viewer',  'template.read'),
    ('trainee', 'task.create'),
    ('trainee', 'task.update'),
    ('auditor', 'program.read'),
    ('auditor', 'template.read')
) as rp(role_key, perm_key)
join roles r on r.role_key = rp.role_key
join permissions p on p.perm_key = rp.perm_key
on conflict do nothing;

-- =========================================================
-- PATCH C: Seed/Guard program before memberships
-- =========================================================

-- Seed the 'orientation' program if not present (adjust columns if your programs table differs)
insert into public.programs (program_id, name)
values ('orientation', 'Orientation')
on conflict (program_id) do nothing;

-- Optional initial program managers (guarded by program existence)
insert into program_memberships(user_id, program_id, role)
select u.id, 'orientation', 'manager'
from public.users u
where u.username = 'admin'
  and exists (select 1 from public.programs pr where pr.program_id = 'orientation')
on conflict do nothing;
