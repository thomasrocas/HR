-- 005_soft_delete_programs.sql
-- Soft delete support for programs

alter table public.programs
  add column if not exists deleted_at timestamp null;
