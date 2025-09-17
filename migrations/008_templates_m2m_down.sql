-- 008_templates_m2m_down.sql
-- Revert program/template m2m relationship.

begin;

alter table public.program_task_templates
  add column if not exists program_id text references public.programs(program_id);

update public.program_task_templates t
set program_id = sub.program_id
from (
  select template_id, program_id
  from (
    select template_id,
           program_id,
           created_at,
           row_number() over (partition by template_id order by created_at, program_id) as rn
    from public.program_template_links
  ) ranked
  where rn = 1
) sub
where t.template_id = sub.template_id;

drop index if exists idx_program_template_links_program;
drop index if exists idx_program_template_links_template;

alter table if exists public.program_template_links
  drop constraint if exists program_template_links_template_id_fkey,
  drop constraint if exists program_template_links_program_id_fkey,
  drop constraint if exists program_template_links_pkey;

drop table if exists public.program_template_links;

commit;
