alter table public.users
  drop column if exists discipline_type,
  drop column if exists department,
  drop column if exists last_name,
  drop column if exists first_name,
  drop column if exists surname,
  drop column if exists sub_unit;