-- 018_add_status_to_users.sql
-- Ensure lifecycle status tracking exists for users.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.users
  ALTER COLUMN status SET DEFAULT 'active';

UPDATE public.users
SET status = 'active'
WHERE status IS NULL;

ALTER TABLE public.users
  ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_status
  ON public.users(status);