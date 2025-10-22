
-- 008_add_week_day_columns.sql
-- Ensure orientation_tasks has week/day_of_week columns expected by UI.
-- Backfill values from scheduled_for and programs.start_date.
-- Idempotent (safe to re-run).

BEGIN;

-- 1) Add columns if missing
ALTER TABLE public.orientation_tasks
  ADD COLUMN IF NOT EXISTS week integer,
  ADD COLUMN IF NOT EXISTS day_of_week integer;

-- 2) Backfill logic only if programs.start_date exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='programs' AND column_name='start_date'
  ) THEN
    -- Compute week as 1 + whole weeks since program start (minimum 1)
    UPDATE public.orientation_tasks t
    SET week = COALESCE(
          t.week,
          GREATEST(
            1,
            1 + ((t.scheduled_for::date - p.start_date)::int / 7)
          )
        )
    FROM public.programs p
    WHERE p.program_id = t.program_id
      AND (t.week IS NULL OR t.week < 1);

    -- Compute day_of_week if missing: Sunday=0 ... Saturday=6
    UPDATE public.orientation_tasks t
    SET day_of_week = COALESCE(t.day_of_week, EXTRACT(DOW FROM t.scheduled_for)::int)
    WHERE t.day_of_week IS NULL AND t.scheduled_for IS NOT NULL;
  ELSE
    -- No start_date column: set defaults to 1 if missing
    UPDATE public.orientation_tasks
    SET week = COALESCE(week, 1)
    WHERE week IS NULL;

    UPDATE public.orientation_tasks
    SET day_of_week = COALESCE(day_of_week, 1) -- Monday
    WHERE day_of_week IS NULL;
  END IF;
END $$;

-- 3) Indexes (help calendar queries)
CREATE INDEX IF NOT EXISTS idx_orientation_tasks_week ON public.orientation_tasks(week);
CREATE INDEX IF NOT EXISTS idx_orientation_tasks_day ON public.orientation_tasks(day_of_week);

COMMIT;
