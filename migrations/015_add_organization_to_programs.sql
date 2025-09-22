alter table public.programs
  add column if not exists organization text,
  add column if not exists sub_unit text;
