-- 008_templates_m2m.sql
-- Introduce a join table between programs and task templates.

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'program_template_links'
  ) then
    create table public.program_template_links (
      template_id public.program_task_templates.template_id%TYPE not null,
      program_id  text not null,
      created_at  timestamptz not null default now(),
      primary key (template_id, program_id)
    );
  end if;
end
$$;

drop index if exists idx_program_template_links_program;
drop index if exists idx_program_template_links_template;

alter table public.program_template_links
  drop constraint if exists program_template_links_template_id_fkey,
  drop constraint if exists program_template_links_program_id_fkey,
  drop constraint if exists program_template_links_pkey;

alter table public.program_template_links
  alter column template_id type public.program_task_templates.template_id%TYPE
    using trim(template_id::text)::public.program_task_templates.template_id%TYPE,
  alter column template_id set not null,
  alter column program_id type text,
  alter column program_id set not null,
  alter column created_at type timestamptz using created_at::timestamptz,
  alter column created_at set default now();

alter table public.program_template_links
  add constraint program_template_links_pkey primary key (template_id, program_id);

alter table public.program_template_links
  add constraint program_template_links_template_id_fkey
    foreign key (template_id)
    references public.program_task_templates(template_id)
    on delete cascade;

alter table public.program_template_links
  add constraint program_template_links_program_id_fkey
    foreign key (program_id)
    references public.programs(program_id)
    on delete cascade;

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
