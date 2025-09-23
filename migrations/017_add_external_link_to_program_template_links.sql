BEGIN;

ALTER TABLE public.program_template_links
  ADD COLUMN IF NOT EXISTS external_link text;

UPDATE public.program_template_links
   SET external_link = t.external_link
  FROM public.program_task_templates AS t
 WHERE t.template_id = public.program_template_links.template_id
   AND (public.program_template_links.external_link IS NULL OR public.program_template_links.external_link = '')
   AND t.external_link IS NOT NULL;

COMMIT;
