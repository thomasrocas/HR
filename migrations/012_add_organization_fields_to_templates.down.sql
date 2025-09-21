BEGIN;

ALTER TABLE public.program_task_templates
  DROP COLUMN IF EXISTS external_link,
  DROP COLUMN IF EXISTS sub_unit,
  DROP COLUMN IF EXISTS organization;

COMMIT;
