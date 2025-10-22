BEGIN;

ALTER TABLE public.program_task_templates
  DROP COLUMN IF EXISTS external_link,
  DROP COLUMN IF EXISTS department,
  DROP COLUMN IF EXISTS type_delivery,
  DROP COLUMN IF EXISTS discipline_type,
  DROP COLUMN IF EXISTS sub_unit,
  DROP COLUMN IF EXISTS organization;

COMMIT;