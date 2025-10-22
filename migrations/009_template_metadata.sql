BEGIN;

ALTER TABLE IF EXISTS public.program_task_templates
  ADD COLUMN IF NOT EXISTS due_offset_days integer,
  ADD COLUMN IF NOT EXISTS required boolean,
  ADD COLUMN IF NOT EXISTS visibility text;

COMMIT;