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

drop table if exists public.program_template_links;

commit;