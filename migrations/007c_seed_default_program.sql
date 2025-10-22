
-- 007c_seed_default_program.sql
-- Robust seeder for a default program + starter tasks.
-- Fixes: RAISE line uses % placeholders (previous version used %% and caused error).
-- Idempotent and works with UUID or TEXT program_id.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

DO $$
DECLARE
  pk_type text;
  title_col text;
  start_col text;
  weeks_col text;

  program_id_text text;
  cast_prog text;
  program_id_found text;
  start_date date;
  weeks int := 6;

  user_id_text text;
  trainee_role_id int;
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

  -- Detect programs table columns
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

  -- Reuse if exists
  EXECUTE format('SELECT program_id::text FROM public.programs WHERE %I = $1 LIMIT 1', title_col)
    INTO program_id_found
  USING 'ANX Orientation';

  IF program_id_found IS NOT NULL THEN
    program_id_text := program_id_found;
  ELSE
    -- Create a program_id explicitly
    IF pk_type = 'uuid' THEN
      program_id_text := gen_random_uuid()::text;
      cast_prog := '$1::uuid';
    ELSE
      program_id_text := 'anx-orientation';
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

  -- Ensure membership (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='program_memberships') THEN
    SELECT role_id INTO trainee_role_id FROM public.roles WHERE role_key='trainee' LIMIT 1;
    IF trainee_role_id IS NULL THEN
      SELECT role_id INTO trainee_role_id FROM public.roles LIMIT 1;
    END IF;

    EXECUTE format('INSERT INTO public.program_memberships(program_id, user_id, role_id)
                    VALUES (%s, $2::uuid, $3) ON CONFLICT DO NOTHING', cast_prog)
    USING program_id_text, user_id_text, trainee_role_id;
  END IF;

  -- Instantiate Week 1..6 tasks for this user (idempotent)
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

  -- ✅ Correct RAISE format placeholders (%)
  RAISE NOTICE 'Seeded program "ANX Orientation" (%) for user %', program_id_text, user_id_text;
END $$;

COMMIT;
