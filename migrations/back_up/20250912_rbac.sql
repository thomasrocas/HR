-- 20250912_rbac_fixed.sql
-- Role-based access control (RBAC) + auditing (idempotent)

-- =========================
-- 1) Core tables (create-if-missing only)
-- =========================

-- Roles (role_id serial, role_key text unique)
create table if not exists roles (
  role_id serial primary key,
  role_key text unique not null
);

-- Permissions (perm_id serial, perm_key text unique)
create table if not exists permissions (
  perm_id serial primary key,
  perm_key text unique not null
);

-- User roles (user_id uuid, role_id int)
create table if not exists user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role_id int not null references roles(role_id) on delete cascade,
  primary key (user_id, role_id)
);

-- Role permissions (role_id int, perm_id int)
create table if not exists role_permissions (
  role_id int not null references roles(role_id) on delete cascade,
  perm_id int not null references permissions(perm_id) on delete cascade,
  primary key (role_id, perm_id)
);

-- Program memberships (who manages which program)
create table if not exists program_memberships (
  user_id uuid not null references public.users(id) on delete cascade,
  program_id text not null references public.programs(program_id) on delete cascade,
  role_in_program text not null default 'manager',
  created_at timestamptz default now(),
  primary key (user_id, program_id)
);

-- Audit log table (if not already created elsewhere)
create table if not exists audit_log(
  id bigserial primary key,
  at timestamptz default now(),
  actor uuid,
  action text,
  table_name text,
  row_id text,
  details jsonb
);

-- =========================
-- 2) Audit triggers (use the already-installed log_audit() function)
-- =========================

-- Drop then (re)create the audit triggers with stable names; harmless if missing
drop trigger if exists trg_audit_programs on public.programs;
create trigger trg_audit_programs after insert or update or delete
on public.programs for each row execute function log_audit();

drop trigger if exists trg_audit_templates on public.program_task_templates;
create trigger trg_audit_templates after insert or update or delete
on public.program_task_templates for each row execute function log_audit();

drop trigger if exists trg_audit_tasks on public.orientation_tasks;
create trigger trg_audit_tasks after insert or update or delete
on public.orientation_tasks for each row execute function log_audit();

-- =========================
-- 3) Seed roles & permissions (no description columns)
-- =========================

insert into roles (role_key) values
('admin'), ('manager'), ('viewer'), ('trainee'), ('auditor')
on conflict (role_key) do nothing;

insert into permissions (perm_key) values
('user.manage'),
('program.create'), ('program.read'), ('program.update'), ('program.delete'),
('template.create'), ('template.read'), ('template.update'), ('template.delete'),
('task.create'), ('task.read'), ('task.update'), ('task.delete'), ('task.assign'),
('audit.read')
on conflict (perm_key) do nothing;

-- =========================
-- 4) Map role -> permissions (uses perm_id, not perm_key)
-- =========================

-- Admin: all permissions
insert into role_permissions(role_id, perm_id)
select r.role_id, p.perm_id
from roles r cross join permissions p
where r.role_key = 'admin'
on conflict do nothing;

-- Manager
insert into role_permissions(role_id, perm_id)
select r.role_id, p.perm_id
from roles r
join permissions p on p.perm_key in (
  'program.create','program.read','program.update','program.delete',
  'template.create','template.read','template.update','template.delete',
  'task.create','task.read','task.update','task.delete','task.assign'
)
where r.role_key = 'manager'
on conflict do nothing;

-- Viewer (read-only)
insert into role_permissions(role_id, perm_id)
select r.role_id, p.perm_id
from roles r
join permissions p on p.perm_key in ('program.read','template.read','task.read')
where r.role_key = 'viewer'
on conflict do nothing;

-- Trainee (read + can update own 'done')
insert into role_permissions(role_id, perm_id)
select r.role_id, p.perm_id
from roles r
join permissions p on p.perm_key in ('program.read','template.read','task.read','task.update')
where r.role_key = 'trainee'
on conflict do nothing;

-- Auditor (read + audit.read)
insert into role_permissions(role_id, perm_id)
select r.role_id, p.perm_id
from roles r
join permissions p on p.perm_key in ('program.read','template.read','task.read','audit.read')
where r.role_key = 'auditor'
on conflict do nothing;

-- =========================
-- 5) (Optional) Example: make a user a manager for a program
-- =========================
-- Replace with a real UUID and program_id if desired:
-- insert into program_memberships(user_id, program_id, role_in_program)
-- values ('00000000-0000-0000-0000-000000000000', 'orientation', 'manager')
-- on conflict do nothing;
