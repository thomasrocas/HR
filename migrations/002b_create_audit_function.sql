BEGIN;
SET search_path = public, pg_catalog;

-- Ensure audit_log exists and has the columns we use
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          bigserial PRIMARY KEY,
  table_name  text        NOT NULL,
  action      text        NOT NULL,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  text        DEFAULT current_user,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS table_name  text,
  ADD COLUMN IF NOT EXISTS action      text,
  ADD COLUMN IF NOT EXISTS old_data    jsonb,
  ADD COLUMN IF NOT EXISTS new_data    jsonb,
  ADD COLUMN IF NOT EXISTS changed_by  text,
  ADD COLUMN IF NOT EXISTS changed_at  timestamptz NOT NULL DEFAULT now();

-- Generic row-change auditor used by all audit_* triggers
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(table_name, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, NULL, to_jsonb(NEW), current_user);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log(table_name, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), to_jsonb(NEW), current_user);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log(table_name, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), NULL, current_user);
    RETURN OLD;
  END IF;
  RETURN NULL;
END
$$;

COMMIT;
