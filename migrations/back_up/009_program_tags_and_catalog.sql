-- 009_program_tags_and_catalog.sql
-- Introduce tag-based program associations and global template catalog.

alter table if exists public.programs
  add column if not exists tags jsonb default '[]'::jsonb;

create table if not exists public.template_catalog (
  template_id uuid primary key default gen_random_uuid(),
  label text not null,
  notes text,
  week_number int,
  sort_order int,
  status text default 'draft',
  tags jsonb default '[]'::jsonb,
  deleted_at timestamp
);

-- Remove legacy program-specific template storage if present.
drop table if exists public.program_task_templates;