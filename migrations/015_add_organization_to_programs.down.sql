alter table public.programs
  drop column if exists organization,
  drop column if exists sub_unit;
