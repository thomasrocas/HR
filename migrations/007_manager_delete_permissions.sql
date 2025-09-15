-- 007_manager_delete_permissions.sql
-- Ensure manager role has delete permissions for programs and templates

BEGIN;

INSERT INTO public.permissions (perm_key, description)
VALUES
  ('program.delete', 'Delete programs'),
  ('template.delete', 'Delete program task templates')
ON CONFLICT (perm_key) DO UPDATE
  SET description = EXCLUDED.description;

DO $$
DECLARE
  has_perm_id boolean;
  has_perm_key boolean;
  program_delete_id integer;
  template_delete_id integer;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'role_permissions'
      AND column_name = 'perm_id'
  )
  INTO has_perm_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'role_permissions'
      AND column_name = 'perm_key'
  )
  INTO has_perm_key;

  IF has_perm_id THEN
    SELECT perm_id INTO program_delete_id
    FROM public.permissions
    WHERE perm_key = 'program.delete';

    SELECT perm_id INTO template_delete_id
    FROM public.permissions
    WHERE perm_key = 'template.delete';

    IF program_delete_id IS NOT NULL THEN
      INSERT INTO public.role_permissions (role_id, perm_id)
      SELECT r.role_id, program_delete_id
      FROM public.roles r
      WHERE r.role_key = 'manager'
      ON CONFLICT DO NOTHING;
    END IF;

    IF template_delete_id IS NOT NULL THEN
      INSERT INTO public.role_permissions (role_id, perm_id)
      SELECT r.role_id, template_delete_id
      FROM public.roles r
      WHERE r.role_key = 'manager'
      ON CONFLICT DO NOTHING;
    END IF;

  ELSIF has_perm_key THEN

    INSERT INTO public.role_permissions (role_id, perm_key)
    SELECT r.role_id, 'program.delete'
    FROM public.roles r
    WHERE r.role_key = 'manager'
    ON CONFLICT DO NOTHING;

    INSERT INTO public.role_permissions (role_id, perm_key)
    SELECT r.role_id, 'template.delete'
    FROM public.roles r
    WHERE r.role_key = 'manager'
    ON CONFLICT DO NOTHING;

  ELSE
    RAISE NOTICE 'role_permissions table is missing perm_id/perm_key; no delete mappings added.';
  END IF;
END $$;

COMMIT;

