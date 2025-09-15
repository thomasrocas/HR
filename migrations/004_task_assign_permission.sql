-- 004_task_assign_permission.sql
-- Seed the task.assign permission and map it to admin/manager roles

BEGIN;

INSERT INTO public.permissions (perm_key, description)
VALUES ('task.assign', 'Assign tasks to dates/users')
ON CONFLICT (perm_key) DO UPDATE
  SET description = EXCLUDED.description;

DO $$
DECLARE
  has_perm_id  boolean;
  has_perm_key boolean;
  perm_assign_id integer;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'role_permissions'
      AND column_name = 'perm_id'
  ) INTO has_perm_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'role_permissions'
      AND column_name = 'perm_key'
  ) INTO has_perm_key;

  IF has_perm_id THEN
    SELECT perm_id INTO perm_assign_id
    FROM public.permissions
    WHERE perm_key = 'task.assign';

    IF perm_assign_id IS NOT NULL THEN
      INSERT INTO public.role_permissions (role_id, perm_id)
      SELECT r.role_id, perm_assign_id
      FROM public.roles r
      WHERE r.role_key IN ('admin', 'manager')
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF has_perm_key THEN
    INSERT INTO public.role_permissions (role_id, perm_key)
    SELECT r.role_id, 'task.assign'
    FROM public.roles r
    WHERE r.role_key IN ('admin', 'manager')
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE NOTICE 'role_permissions table is missing perm_id/perm_key; no task.assign mappings added.';
  END IF;
END $$;

COMMIT;
