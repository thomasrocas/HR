alter table public.programs
  add column if not exists department text,
  add column if not exists discipline_type text;
