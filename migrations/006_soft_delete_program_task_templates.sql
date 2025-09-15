-- 006_soft_delete_program_task_templates.sql
-- Soft delete support for program task templates

alter table public.program_task_templates
  add column if not exists deleted_at timestamp null;
