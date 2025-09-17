-- 008_add_status_to_program_task_templates.sql
-- Add status tracking for program task templates.

alter table public.program_task_templates
  add column if not exists status text default 'draft';

update public.program_task_templates
  set status = coalesce(status, 'draft');
