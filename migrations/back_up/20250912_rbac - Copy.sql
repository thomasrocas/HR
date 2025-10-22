-- migrations/20250912_rbac.sql
-- Role-Based Access Control (RBAC) + RLS for programs/templates/tasks

BEGIN;

-- === Core RBAC tables =======================================================
create table if not exists public.roles(
  role_id serial primary key,
  name text unique not null check (name ~ '^[a-z_]+$'),
  description text,
  created_at timestamptz default now()
);

create table if not exists public.permissions(
  perm_id serial primary key,
  name text unique not null,            -- e.g. 'task.write'
  description text
);

create table if not exists public.role_permissions(
  role_id int references public.roles(role_id) on delete cascade,
  perm_id int references public.permissions(perm_id) on delete cascade,
  primary key (role_id, perm_id)
);

-- FIXED: no expression in PK; surrogate key + unique index for (user, role, scope)
create table if not exists public.user_roles(
  user_role_id serial primary key,
  user_id int references public.users(id) on delete cascade,
  role_id int references public.roles(role_id) on delete cascade,
  scope_program_id int references public.programs(program_id) on delete cascade  -- NULL = global scope
);

-- Optional: per-program membership labeling (manager/viewer/trainee)
create table if not exists public.program_memberships(
  program_id int references public.programs(program_id) on delete cascade,
  user_id int references public.users(id) on delete cascade,
  role text not null check (role in ('manager','viewer','trainee')),
  created_at timestamptz default now(),
  primary key (program_id, user_id)
);

-- Minimal audit trail (append-only)
create table if not exists public.audit_log(
  id bigserial primary key,
  user_id int,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  at timestamptz default now()
);

create index if not exists audit_log_entity_idx on public.audit_log(entity, entity_id);

-- Uniqueness for user_roles: treat NULL scope as a single bucket via coalesce()
create unique index if not exists user_roles_unique_idx
  on public.user_roles (user_id, role_id, coalesce(scope_program_id, -1));

-- Helper indexes
create index if not exists ur_user_scope_idx on public.user_roles (user_id, role_id, scope_program_id);
create index if not exists pm_user_prog_idx on public.program_memberships (user_id, program_id);

-- === Seed roles and permissions ============================================
insert into public.roles(name,description) values
 ('admin','System administrator'),
 ('manager','Program manager'),
 ('viewer','Read-only viewer'),
 ('trainee','End user who can complete own tasks')
on conflict (name) do nothing;

insert into public.permissions(name,description) values
 ('program.read','List/read programs'),
 ('program.write','Create/update/delete programs'),
 ('template.read','List/read templates'),
 ('template.write','Create/update/delete templates'),
 ('task.read','List/read tasks'),
 ('task.write','Create/update/delete tasks'),
 ('task.assign','Schedule/move/unschedule tasks'),
 ('task.complete.self','Toggle own task completion'),
 ('user.manage','Create/update users & roles')
on conflict (name) do nothing;

with ids as (
  select
    (select role_id from public.roles where name='admin')   as admin_id,
    (select role_id from public.roles where name='manager') as manager_id,
    (select role_id from public.roles where name='viewer')  as viewer_id,
    (select role_id from public.roles where name='trainee') as trainee_id
)
insert into public.role_permissions(role_id, perm_id)
select admin_id, perm_id from ids cross join public.permissions
union all
select manager_id, perm_id from ids join public.permissions p
  on p.name in ('program.read','program.write','template.read','template.write','task.read','task.write','task.assign')
union all
select viewer_id, perm_id from ids join public.permissions p
  on p.name in ('program.read','template.read','task.read')
union all
select trainee_id, perm_id from ids join public.permissions p
  on p.name in ('program.read','template.read','task.read','task.complete.self')
on conflict do nothing;

-- === RLS enablement + helpers ==============================================
create schema if not exists app;

-- Enable RLS on domain tables
alter table public.programs enable row level security;
alter table public.program_task_templates enable row level security;
alter table public.orientation_tasks enable row level security;

-- Helper: parse CSV -> int[]
create or replace function app.csv_int_array(txt text)
returns int[] language sql immutable as $$
  select case when coalesce(txt,'')='' then '{}'::int[] else string_to_array(txt,',')::int[] end
$$;

-- Policies: READ
create policy if not exists programs_read on public.programs
for select using (
  position('admin' in coalesce(current_setting('app.role_names', true),'')) > 0
  or programs.created_by = nullif(current_setting('app.user_id', true), '')::int
  or programs.program_id = any(app.csv_int_array(current_setting('app.program_ids', true)))
);

create policy if not exists templates_read on public.program_task_templates
for select using (
  position('admin' in coalesce(current_setting('app.role_names', true),'')) > 0
  or program_id = any(app.csv_int_array(current_setting('app.program_ids', true)))
);

create policy if not exists tasks_read on public.orientation_tasks
for select using (
  position('admin' in coalesce(current_setting('app.role_names', true),'')) > 0
  or user_id = nullif(current_setting('app.user_id', true),'')::int
  or program_id = any(app.csv_int_array(current_setting('app.program_ids', true)))
);

-- Policies: WRITE (managers/admins) + self-complete for trainees
create policy if not exists programs_write on public.programs
for all using (
  position('admin' in coalesce(current_setting('app.role_names', true),'')) > 0
  or (
    position('manager' in coalesce(current_setting('app.role_names', true),'')) > 0
    and programs.program_id = any(app.csv_int_array(current_setting('app.program_ids', true)))
  )
) with check (true);

create policy if not exists templates_write on public.program_task_templates
for all using (
  position('admin' in coalesce(current_setting('app.role_names', true),'')) > 0
  or (
    position('manager' in coalesce(current_setting('app.role_names', true),'')) > 0
    and program_id = any(app.csv_int_array(current_setting('app.program_ids', true)))
  )
) with check (true);

create policy if not exists tasks_write_manager on public.orientation_tasks
for all using (
  position('admin' in coalesce(current_setting('app.role_names', true),'')) > 0
  or (
    position('manager' in coalesce(current_setting('app.role_names', true),'')) > 0
    and program_id = any(app.csv_int_array(current_setting('app.program_ids', true)))
  )
) with check (true);

-- Trainee can only update own tasks (e.g., toggle done)
create policy if not exists tasks_complete_self on public.orientation_tasks
for update using (
  position('trainee' in coalesce(current_setting('app.role_names', true),'')) > 0
  and user_id = nullif(current_setting('app.user_id', true),'')::int
) with check (
  user_id = nullif(current_setting('app.user_id', true),'')::int
);

-- Tighten default privileges so RLS governs access
revoke all on public.programs, public.program_task_templates, public.orientation_tasks from public;

-- === Performance indexes on existing domain tables ==========================
create index if not exists ot_prog_user_wk_idx
  on public.orientation_tasks(program_id, user_id, week_number, scheduled_for);
create index if not exists ptt_prog_wk_sort_idx
  on public.program_task_templates(program_id, week_number, sort_order);

COMMIT;
