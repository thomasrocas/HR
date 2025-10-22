BEGIN;

-- 0) Clean stray column (old schema sometimes had perm_key here)
ALTER TABLE IF EXISTS public.role_permissions
  DROP COLUMN IF EXISTS perm_key;

-- 1) Remove duplicates to allow a UNIQUE constraint
DELETE FROM public.role_permissions a
USING public.role_permissions b
WHERE a.role_id = b.role_id
  AND a.perm_id = b.perm_id
  AND a.ctid > b.ctid;

-- 2) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm_id ON public.role_permissions(perm_id);

-- 3) Add UNIQUE(role_id, perm_id) idempotently (no IF NOT EXISTS available)
DO $$
BEGIN
  IF NOT EXISTS (
     SELECT 1
     FROM pg_constraint
     WHERE conname = 'role_permissions_unique'
       AND conrelid = 'public.role_permissions'::regclass
  ) THEN
     ALTER TABLE public.role_permissions
     ADD CONSTRAINT role_permissions_unique UNIQUE (role_id, perm_id);
  END IF;
END $$;

-- 4) Recreate audit triggers idempotently (EXECUTE PROCEDURE works PG 9.6+)
DROP TRIGGER IF EXISTS audit_orientation_tasks       ON public.orientation_tasks;
CREATE TRIGGER audit_orientation_tasks
AFTER INSERT OR UPDATE OR DELETE ON public.orientation_tasks
FOR EACH ROW EXECUTE PROCEDURE public.audit_row_change();

DROP TRIGGER IF EXISTS audit_programs                ON public.programs;
CREATE TRIGGER audit_programs
AFTER INSERT OR UPDATE OR DELETE ON public.programs
FOR EACH ROW EXECUTE PROCEDURE public.audit_row_change();

DROP TRIGGER IF EXISTS audit_program_task_templates  ON public.program_task_templates;
CREATE TRIGGER audit_program_task_templates
AFTER INSERT OR UPDATE OR DELETE ON public.program_task_templates
FOR EACH ROW EXECUTE PROCEDURE public.audit_row_change();

DROP TRIGGER IF EXISTS audit_program_memberships     ON public.program_memberships;
CREATE TRIGGER audit_program_memberships
AFTER INSERT OR UPDATE OR DELETE ON public.program_memberships
FOR EACH ROW EXECUTE PROCEDURE public.audit_row_change();

-- 5) Seed permissions first (safe to re-run)
INSERT INTO public.permissions (perm_key, description)
VALUES
  ('program.create','Create programs'),
  ('program.read','View programs'),
  ('program.update','Edit programs'),
  ('program.delete','Delete programs'),
  ('template.create','Create program task templates'),
  ('template.read','View program task templates'),
  ('template.update','Edit program task templates'),
  ('template.delete','Delete program task templates'),
  ('task.create','Create tasks'),
  ('task.read','View tasks'),
  ('task.update','Edit/move tasks'),
  ('task.assign','Assign tasks to dates/users'),
  ('task.delete','Delete tasks'),
  ('membership.manage','Add/remove users to programs'),
  ('admin.users.manage','Manage users / roles'),
  ('admin.audit.read','View audit log')
ON CONFLICT (perm_key) DO NOTHING;

-- 6) Map roles → permissions using whatever the roles PK is (id or role_id)
DO $$
DECLARE pk_col text;
BEGIN
  SELECT a.attname
  INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a
    ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = 'public.roles'::regclass
    AND i.indisprimary
  LIMIT 1;

  IF pk_col IS NULL THEN
    RAISE EXCEPTION 'Cannot determine primary key column for public.roles';
  END IF;

  -- Admin = all permissions
  EXECUTE format($f$
    INSERT INTO public.role_permissions (role_id, perm_id)
    SELECT r.%I, p.perm_id
    FROM public.roles r
    CROSS JOIN public.permissions p
    WHERE r.role_key = 'admin'
    ON CONFLICT DO NOTHING;
  $f$, pk_col);

  -- Manager = curated set
  EXECUTE format($f$
    INSERT INTO public.role_permissions (role_id, perm_id)
    SELECT r.%I, p.perm_id
    FROM public.roles r
    JOIN public.permissions p ON p.perm_key IN (
      'program.create','program.read','program.update','program.delete',
      'template.create','template.read','template.update','template.delete',
      'task.create','task.read','task.update','task.assign',
      'membership.manage'
    )
    WHERE r.role_key = 'manager'
    ON CONFLICT DO NOTHING;
  $f$, pk_col);

  -- Viewer = read only
  EXECUTE format($f$
    INSERT INTO public.role_permissions (role_id, perm_id)
    SELECT r.%I, p.perm_id
    FROM public.roles r
    JOIN public.permissions p ON p.perm_key IN (
      'program.read','template.read','task.read'
    )
    WHERE r.role_key = 'viewer'
    ON CONFLICT DO NOTHING;
  $f$, pk_col);
END $$;

COMMIT;