
-- 007_seed_default_program.sql
-- Purpose: Create a default "ANX Orientation" program, add membership for a user,
-- optionally seed program_task_templates and instantiate initial tasks.
-- Safe to run multiple times (idempotent).

BEGIN;

-- -------- Helpers: existence checks --------
-- Check required tables exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='programs') THEN
    RAISE EXCEPTION 'Table public.programs does not exist.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users') THEN
    RAISE EXCEPTION 'Table public.users does not exist.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orientation_tasks') THEN
    RAISE EXCEPTION 'Table public.orientation_tasks does not exist.';
  END IF;
END $$;

-- -------- Main logic --------
DO $$
DECLARE
  title_col text;
  start_col text;
  weeks_col text;
  tmpl_label_col text;
  has_templates boolean := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='program_task_templates');
  program_id_text text;
  start_date date;
  weeks int := 6;
  user_id_text text;
  trainee_role_id int;
BEGIN
  -- Choose a user to own the program/tasks:
  SELECT id::text
  INTO user_id_text
  FROM public.users
  WHERE email ILIKE 'thomasrocas%anxlife.%' OR username ILIKE 'thomasrocas%'
  ORDER BY created_at NULLS LAST, id
  LIMIT 1;

  IF user_id_text IS NULL THEN
    SELECT id::text INTO user_id_text FROM public.users ORDER BY created_at NULLS LAST, id LIMIT 1;
  END IF;

  IF user_id_text IS NULL THEN
    RAISE EXCEPTION 'No users found to assign program/tasks to.';
  END IF;

  -- Detect column names on programs
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

  -- Upsert program "ANX Orientation"
  EXECUTE format('SELECT program_id::text FROM public.programs WHERE %I = $1 LIMIT 1', title_col)
    INTO program_id_text
  USING 'ANX Orientation';

  IF program_id_text IS NULL THEN
    IF start_col IS NOT NULL AND weeks_col IS NOT NULL THEN
      EXECUTE format('INSERT INTO public.programs(%I, %I, %I) VALUES ($1, $2, $3) RETURNING program_id::text', title_col, start_col, weeks_col)
      INTO program_id_text
      USING 'ANX Orientation', current_date, weeks;
      start_date := current_date;
    ELSE
      EXECUTE format('INSERT INTO public.programs(%I) VALUES ($1) RETURNING program_id::text', title_col)
      INTO program_id_text
      USING 'ANX Orientation';
      IF start_col IS NOT NULL THEN
        EXECUTE format('SELECT %I FROM public.programs WHERE program_id::text = $1', start_col)
          INTO start_date
        USING program_id_text;
      END IF;
    END IF;
  ELSE
    IF start_col IS NOT NULL THEN
      EXECUTE format('SELECT %I FROM public.programs WHERE program_id::text = $1', start_col)
        INTO start_date
      USING program_id_text;
    END IF;
  END IF;

  -- Ensure a membership record for this user (if table exists and has expected columns)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='program_memberships') THEN
    SELECT role_id INTO trainee_role_id FROM public.roles WHERE role_key='trainee' LIMIT 1;
    IF trainee_role_id IS NULL THEN
      SELECT role_id INTO trainee_role_id FROM public.roles LIMIT 1;
    END IF;
    EXECUTE 'INSERT INTO public.program_memberships(program_id, user_id, role_id)
             VALUES ($1::text::uuid, $2::text::uuid, $3)
             ON CONFLICT DO NOTHING'
    USING program_id_text, user_id_text, trainee_role_id;
  END IF;

  -- Seed program_task_templates if table/columns exist
  IF has_templates THEN
    SELECT CASE
             WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='program_task_templates' AND column_name='label') THEN 'label'
             WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='program_task_templates' AND column_name='title') THEN 'title'
             ELSE NULL
           END
    INTO tmpl_label_col;

    IF tmpl_label_col IS NOT NULL THEN
      FOR i IN 1..6 LOOP
        EXECUTE format(
          'INSERT INTO public.program_task_templates(program_id, %I, week, day_of_week)
           SELECT $1, $2, $3, $4
           WHERE NOT EXISTS (
             SELECT 1 FROM public.program_task_templates
             WHERE program_id::text=$1 AND %I=$2 AND week=$3 AND day_of_week=$4
           );', tmpl_label_col, tmpl_label_col
        )
        USING program_id_text, format('Week %s Check-in', i), i, 1;
      END LOOP;
    END IF;
  END IF;

  -- Instantiate initial tasks for the user (even if templates missing)
  FOR i IN 1..6 LOOP
    IF start_date IS NOT NULL THEN
      EXECUTE '
        INSERT INTO public.orientation_tasks (program_id, user_id, label, week, day_of_week, scheduled_for, deleted)
        SELECT $1::text::uuid, $2::text::uuid, $3, $4, 1, $5::date, false
        WHERE NOT EXISTS (
          SELECT 1 FROM public.orientation_tasks
          WHERE program_id::text=$1 AND user_id::text=$2 AND label=$3 AND week=$4
        )'
      USING program_id_text, user_id_text, format('Week %s Check-in', i), i, (current_date + (i-1) * 7);
    ELSE
      EXECUTE '
        INSERT INTO public.orientation_tasks (program_id, user_id, label, week, day_of_week, scheduled_for, deleted)
        SELECT $1::text::uuid, $2::text::uuid, $3, $4, 1, NULL, false
        WHERE NOT EXISTS (
          SELECT 1 FROM public.orientation_tasks
          WHERE program_id::text=$1 AND user_id::text=$2 AND label=$3 AND week=$4
        )'
      USING program_id_text, user_id_text, format('Week %s Check-in', i), i;
    END IF;
  END LOOP;

  RAISE NOTICE 'Seed complete. Program=ANX Orientation, Program ID %, User %', program_id_text, user_id_text;
END $$;

COMMIT;
