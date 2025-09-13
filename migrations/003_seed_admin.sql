-- 003_seed_admin.sql
-- Ensure at least one admin user exists and is assigned the admin role

-- Create an initial admin user if one doesn't already exist
insert into public.users (username, email, full_name, password_hash, provider)
values (
  'admin',
  'admin@example.com',
  'Initial Admin',
  '$2b$12$L76aS1UDRIgja5OpViZubekQpYhDly.eopPsnca2H9xzs46ej9eAq',
  'local'
)
on conflict (username) do nothing;

-- Attach the admin role to the user
insert into user_roles (user_id, role_id)
select u.id, r.role_id
from public.users u
join roles r on r.role_key = 'admin'
where u.username = 'admin'
on conflict do nothing;
