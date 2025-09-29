alter table public.programs
  add column if not exists department text;

alter table public.programs
  add column if not exists discipline_type text;
