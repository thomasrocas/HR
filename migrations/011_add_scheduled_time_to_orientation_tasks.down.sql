BEGIN;

ALTER TABLE public.orientation_tasks
  DROP COLUMN IF EXISTS scheduled_time;

COMMIT;