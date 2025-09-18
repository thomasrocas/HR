BEGIN;

-- 1) Best-effort restore of the legacy 1-to-many model before we drop the link table.
--    If a template is linked to exactly ONE program, copy that program_id back.
UPDATE public.program_task_templates t
SET program_id = p.program_id
FROM (
  SELECT template_id, MIN(program_id) AS program_id
  FROM public.program_template_links
  GROUP BY template_id
  HAVING COUNT(*) = 1
) AS p
WHERE t.template_id = p.template_id
  AND t.program_id IS NULL;

-- 2) Try to enforce NOT NULL again on the legacy column if safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.program_task_templates WHERE program_id IS NULL) THEN
    RAISE NOTICE 'Skipping SET NOT NULL on program_task_templates.program_id because some rows are NULL.';
  ELSE
    EXECUTE 'ALTER TABLE public.program_task_templates ALTER COLUMN program_id SET NOT NULL';
  END IF;
END
$$;

-- 3) Drop helper indexes then the link table
DROP INDEX IF EXISTS public.idx_ptl_template_id;
DROP INDEX IF EXISTS public.idx_ptl_program_id;
DROP TABLE IF EXISTS public.program_template_links;

COMMIT;
