BEGIN;

ALTER TABLE public.orientation_tasks
  ADD COLUMN scheduled_time time;

COMMIT;