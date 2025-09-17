-- 008_templates_m2m.sql
-- Introduce a join table between programs and task templates.

begin;

create table if not exists public.program_template_links (
  template_id public.program_task_templates.template_id%TYPE not null
    references public.program_task_templates(template_id) on delete cascade,
  program_id  text not null references public.programs(program_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (template_id, program_id)
);

create index if not exists idx_program_template_links_program on public.program_template_links(program_id);
create index if not exists idx_program_template_links_template on public.program_template_links(template_id);

insert into public.program_template_links (template_id, program_id, created_at)
select template_id, program_id, now()
from public.program_task_templates
where program_id is not null
on conflict do nothing;

alter table public.program_task_templates
drop column if exists program_id;

commit;
