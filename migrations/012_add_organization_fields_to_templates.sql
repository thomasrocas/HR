BEGIN;

ALTER TABLE public.program_task_templates
  ADD COLUMN IF NOT EXISTS organization text,
  ADD COLUMN IF NOT EXISTS sub_unit text,
  ADD COLUMN IF NOT EXISTS discipline_type text,
  ADD COLUMN IF NOT EXISTS type_delivery text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS external_link text;

COMMIT;