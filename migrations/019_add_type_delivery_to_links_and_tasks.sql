ALTER TABLE public.program_template_links
  ADD COLUMN IF NOT EXISTS type_delivery text;

ALTER TABLE public.orientation_tasks
  ADD COLUMN IF NOT EXISTS type_delivery text;

UPDATE public.program_template_links
   SET type_delivery = t.type_delivery
  FROM public.program_task_templates t
 WHERE public.program_template_links.template_id = t.template_id
   AND t.type_delivery IS NOT NULL
   AND (
     public.program_template_links.type_delivery IS NULL
     OR public.program_template_links.type_delivery <> t.type_delivery
   );
