BEGIN;

ALTER TABLE public.program_template_links
  DROP COLUMN IF EXISTS external_link;

COMMIT;