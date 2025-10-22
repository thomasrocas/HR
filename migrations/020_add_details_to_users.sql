alter table public.users
  add column if not exists discipline_type text,
  add column if not exists last_name text,
  add column if not exists surname text,
  add column if not exists first_name text,
  add column if not exists department text,
  add column if not exists sub_unit text;