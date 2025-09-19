BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS public.program_template_links
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS week_number integer,
  ADD COLUMN IF NOT EXISTS sort_order integer,
  ADD COLUMN IF NOT EXISTS due_offset_days integer,
  ADD COLUMN IF NOT EXISTS required boolean,
  ADD COLUMN IF NOT EXISTS visibility text,
  ADD COLUMN IF NOT EXISTS visible boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.program_template_links
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN visible SET DEFAULT true;

ALTER TABLE public.program_template_links
  DROP CONSTRAINT IF EXISTS program_template_links_pkey;

ALTER TABLE public.program_template_links
  ADD CONSTRAINT program_template_links_pkey PRIMARY KEY (id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'program_template_links_program_template_key'
       AND conrelid = 'public.program_template_links'::regclass
  ) THEN
    ALTER TABLE public.program_template_links
      ADD CONSTRAINT program_template_links_program_template_key UNIQUE (program_id, template_id);
  END IF;
END$$;

UPDATE public.program_template_links AS l
   SET week_number = COALESCE(l.week_number, t.week_number),
       sort_order = COALESCE(l.sort_order, t.sort_order),
       due_offset_days = COALESCE(l.due_offset_days, t.due_offset_days),
       required = COALESCE(l.required, t.required),
       visibility = COALESCE(l.visibility, t.visibility),
       notes = COALESCE(l.notes, t.notes)
  FROM public.program_task_templates AS t
 WHERE t.template_id = l.template_id;

UPDATE public.program_template_links
   SET visible = COALESCE(visible, true);

UPDATE public.program_template_links
   SET updated_at = COALESCE(updated_at, created_at);

CREATE OR REPLACE FUNCTION public.set_program_template_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_program_template_links_updated_at
  ON public.program_template_links;

CREATE TRIGGER set_program_template_links_updated_at
BEFORE UPDATE ON public.program_template_links
FOR EACH ROW
EXECUTE FUNCTION public.set_program_template_links_updated_at();

COMMIT;
