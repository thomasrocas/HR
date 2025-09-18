BEGIN;

-- 1) Create the M2M link table
CREATE TABLE IF NOT EXISTS public.program_template_links (
  program_id  text   NOT NULL
    REFERENCES public.programs(program_id) ON DELETE CASCADE,
  template_id bigint NOT NULL
    REFERENCES public.program_task_templates(template_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_template_links_pkey PRIMARY KEY (program_id, template_id)
);

-- 2) Helpful indexes (the PK covers (program_id, template_id); we add a single-column
--    index on template_id for reverse lookups)
CREATE INDEX IF NOT EXISTS idx_ptl_template_id ON public.program_template_links (template_id);
CREATE INDEX IF NOT EXISTS idx_ptl_program_id  ON public.program_template_links (program_id);

-- 3) Backfill links from the existing 1-to-many column on templates (if present)
INSERT INTO public.program_template_links (program_id, template_id)
SELECT ptt.program_id, ptt.template_id
FROM public.program_task_templates AS ptt
WHERE ptt.program_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4) Make the legacy column nullable so M2M can be used going forward
--    (You can drop this column in a later migration once code no longer relies on it.)
ALTER TABLE public.program_task_templates
  ALTER COLUMN program_id DROP NOT NULL;

COMMIT;
