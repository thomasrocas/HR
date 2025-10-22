
-- 007b_seed_default_program.sql
-- Robust seeder for a default program + starter tasks.
-- Handles both UUID and TEXT/VARCHAR program_id schemas. Idempotent.

BEGIN;

-- Ensure uuid generation is available if program_id is UUID
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- provides gen_random_uuid()

DO $$
DECLARE
  -- Programs table shape
  pk_type text;               -- data_type of program_id (uuid, text, character varying)
  title_col text;
  start_col text;
  weeks_col text;

  -- Values we will compute
  program_id_text text;       -- store as text; cast at insert time as needed
  cast_prog text;             -- '$1::uuid' or '$1' depending on pk type
  program_id_found text;
  start_date date;
  weeks int := 6;

  -- User + roles
  user_id_text text;
  trainee_role_id int;

  -- Helpers
  has_templates boolean := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='program_task_templates');
BEGIN
  -- Pick a user (prefer Thomas, else first user)
  SELECT id::text INTO user_id_text
  FROM public.users
  WHERE email ILIKE 'thomasrocas%anxlife.%' OR username ILIKE 'thomasrocas%'
  ORDER BY created_at NULLS LAST, id
  LIMIT 1;

  IF user_id_text IS NULL THEN
    SELECT id::text INTO user_id_text
    FROM public.users
    ORDER BY created_at NULLS LAST, id
    LIMIT 1;
  END IF;

  IF user_id_text IS NULL THEN
    RAISE EXCEPTION 'No users found to assign program/tasks to.';
  END IF;

  -- Detect columns in programs
  SELECT data_type INTO pk_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='programs' AND column_name='program_id';

  IF pk_type IS NULL THEN
    RAISE EXCEPTION 'public.programs must have a column program_id.';
  END IF;

  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='programs' AND column_name='title') THEN 'title'
           WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='programs' AND column_name='name') THEN 'name'
           ELSE NULL
         END,
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='programs' AND column_name='start_date') THEN 'start_date' ELSE NULL END,
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='programs' AND column_name='weeks') THEN 'weeks' ELSE NULL END
  INTO title_col, start_col, weeks_col;

  IF title_col IS NULL THEN
    RAISE EXCEPTION 'Could not find a label column on public.programs (expected "title" or "name").';
  END IF;

  -- If program already exists by title, reuse it
  EXECUTE format('SELECT program_id::text FROM public.programs WHERE %I = $1 LIMIT 1', title_col)
    INTO program_id_found
  USING 'ANX Orientation';

  IF program_id_found IS NOT NULL THEN
    program_id_text := program_id_found;
  ELSE
    -- Need to create, compute a program_id value depending on type
    IF pk_type = 'uuid' THEN
      program_id_text := gen_random_uuid()::text;
      cast_prog := '$1::uuid';
    ELSE
      program_id_text := 'anx-orientation';  -- stable slug
      cast_prog := '$1';
    END IF;

    IF start_col IS NOT NULL AND weeks_col IS NOT NULL THEN
      EXECUTE format('INSERT INTO public.programs(program_id, %I, %I, %I) VALUES (%s, $1, $2, $3)',
                     title_col, start_col, weeks_col, cast_prog)
      USING program_id_text, 'ANX Orientation', current_date, weeks;
      start_date := current_date;
    ELSE
      EXECUTE format('INSERT INTO public.programs(program_id, %I) VALUES (%s, $1)',
                     title_col, cast_prog)
      USING program_id_text, 'ANX Orientation';
      IF start_col IS NOT NULL THEN
        EXECUTE format('SELECT %I FROM public.programs WHERE program_id::text = $1', start_col)
          INTO start_date
        USING program_id_text;
      END IF;
    END IF;
  END IF;

  -- program_id_text is set. Ensure membership (if table present)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='program_memberships') THEN
    SELECT role_id INTO trainee_role_id FROM public.roles WHERE role_key='trainee' LIMIT 1;
    IF trainee_role_id IS NULL THEN
      SELECT role_id INTO trainee_role_id FROM public.roles LIMIT 1;
    END IF;

    EXECUTE format('INSERT INTO public.program_memberships(program_id, user_id, role_id)
                    VALUES (%s, $2::uuid, $3) ON CONFLICT DO NOTHING', cast_prog)
    USING program_id_text, user_id_text, trainee_role_id;
  END IF;

  -- Optional: seed a minimal template set
  IF has_templates THEN
    PERFORM 1; -- keep code short; templates are optional in this pass
  END IF;

  -- Instantiate simple Week 1..6 tasks to this user (no duplicates)
  FOR i IN 1..6 LOOP
    IF start_col IS NOT NULL THEN
      EXECUTE format(
        'INSERT INTO public.orientation_tasks (program_id, user_id, label, week, day_of_week, scheduled_for, deleted)
         SELECT %s, $2::uuid, $3, $4, 1, $5::date, false
         WHERE NOT EXISTS (
           SELECT 1 FROM public.orientation_tasks
           WHERE program_id::text=$1 AND user_id::text=$2 AND label=$3 AND week=$4
         )', cast_prog)
      USING program_id_text, user_id_text, format('Week %s Check-in', i), i, (current_date + (i-1) * 7);
    ELSE
      EXECUTE format(
        'INSERT INTO public.orientation_tasks (program_id, user_id, label, week, day_of_week, scheduled_for, deleted)
         SELECT %s, $2::uuid, $3, $4, 1, NULL, false
         WHERE NOT EXISTS (
           SELECT 1 FROM public.orientation_tasks
           WHERE program_id::text=$1 AND user_id::text=$2 AND label=$3 AND week=$4
         )', cast_prog)
      USING program_id_text, user_id_text, format('Week %s Check-in', i), i;
    END IF;
  END LOOP;

  RAISE NOTICE 'Seeded program "ANX Orientation" (%%) for user %%', program_id_text, user_id_text;
END $$;

COMMIT;
