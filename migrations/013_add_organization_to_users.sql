-- Adds organization column to public.users so RBAC APIs can surface employer context.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS organization text;
