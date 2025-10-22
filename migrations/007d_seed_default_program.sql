
-- 007d_seed_default_program.sql
-- Robust seeder for a default program + starter tasks.
-- Handles: UUID/TEXT program_id, optional start_date/weeks, and program_memberships
-- schemas that MAY NOT have a role_id column. Idempotent.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

DO $$
DECLARE
  -- Table/column detection
  pk_type text;              -- programs.program_id data_type
  user_pk_type text;         -- users.id data_type
  title_col text;
  start_col text;
  weeks_col text;

  -- program_memberships columns
  pm_has_role_id boolean := false;
  pm_role_text_col text := NULL;  -- 'role_key' or 'role' if present

  -- Values
  program_id_text text;
  cast_prog text;            -- '$1::uuid' or '$1'
  cast_user text;            -- '$2::uuid' or '$2'
  program_id_found text;
  start_date date := NULL;
  weeks int := 6;

  user_id_text text;
  trainee_role_id int := NULL;
BEGIN
  -- ----- Pick a user (prefer Thomas, else first user) -----
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

  -- ----- Detect programs table columns/types -----
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

  -- ----- Detect users.id type for proper casting -----
  SELECT data_type INTO user_pk_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name='id';

  IF user_pk_type = 'uuid' THEN
    cast_user := '$2::uuid';
  ELSE
    cast_user := '$2';
  END IF;

  -- ----- Detect program_memberships structure (if table exists) -----
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='program_memberships') THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema='public' AND table_name='program_memberships' AND column_name='role_id'
    ) INTO pm_has_role_id;

    SELECT CASE
             WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='program_memberships' AND column_name='role_key') THEN 'role_key'
             WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='program_memberships' AND column_name='role') THEN 'role'
             ELSE NULL
           END
    INTO pm_role_text_col;

    -- get trainee role_id if available (for role_id path)
    IF pm_has_role_id THEN
      SELECT role_id INTO trainee_role_id FROM public.roles WHERE role_key='trainee' LIMIT 1;
      IF trainee_role_id IS NULL THEN
        SELECT role_id INTO trainee_role_id FROM public.roles LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- ----- Reuse or create program -----
  EXECUTE format('SELECT program_id::text FROM public.programs WHERE %I = $1 LIMIT 1', title_col)
    INTO program_id_found
  USING 'ANX Orientation';

  IF program_id_found IS NOT NULL THEN
    program_id_text := program_id_found;
  ELSE
    -- Create new program_id
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

  -- ----- Ensure membership (if program_memberships exists) -----
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='program_memberships') THEN
    IF pm_has_role_id THEN
      -- With role_id column
      EXECUTE format(
        'INSERT INTO public.program_memberships(program_id, user_id, role_id)
         SELECT %s, %s, $3
         WHERE NOT EXISTS (
           SELECT 1 FROM public.program_memberships
           WHERE program_id::text=$1 AND user_id::text=$2
         )',
        cast_prog, cast_user
      )
      USING program_id_text, user_id_text, trainee_role_id;

    ELSIF pm_role_text_col IS NOT NULL THEN
      -- With a text role column (role_key or role)
      EXECUTE format(
        'INSERT INTO public.program_memberships(program_id, user_id, %I)
         SELECT %s, %s, $3
         WHERE NOT EXISTS (
           SELECT 1 FROM public.program_memberships
           WHERE program_id::text=$1 AND user_id::text=$2
         )',
        pm_role_text_col, cast_prog, cast_user
      )
      USING program_id_text, user_id_text, 'trainee';
    ELSE
      -- No role column; just ensure membership exists
      EXECUTE format(
        'INSERT INTO public.program_memberships(program_id, user_id)
         SELECT %s, %s
         WHERE NOT EXISTS (
           SELECT 1 FROM public.program_memberships
           WHERE program_id::text=$1 AND user_id::text=$2
         )',
        cast_prog, cast_user
      )
      USING program_id_text, user_id_text;
    END IF;
  END IF;

  -- ----- Instantiate Week 1..6 tasks for this user (idempotent) -----
  FOR i IN 1..6 LOOP
    IF start_date IS NOT NULL THEN
      EXECUTE format(
        'INSERT INTO public.orientation_tasks (program_id, user_id, label, week, day_of_week, scheduled_for, deleted)
         SELECT %s, %s, $3, $4, 1, $5::date, false
         WHERE NOT EXISTS (
           SELECT 1 FROM public.orientation_tasks
           WHERE program_id::text=$1 AND user_id::text=$2 AND label=$3 AND week=$4
         )',
        cast_prog, cast_user
      )
      USING program_id_text, user_id_text, format('Week %s Check-in', i), i, (current_date + (i-1) * 7);
    ELSE
      EXECUTE format(
        'INSERT INTO public.orientation_tasks (program_id, user_id, label, week, day_of_week, scheduled_for, deleted)
         SELECT %s, %s, $3, $4, 1, NULL, false
         WHERE NOT EXISTS (
           SELECT 1 FROM public.orientation_tasks
           WHERE program_id::text=$1 AND user_id::text=$2 AND label=$3 AND week=$4
         )',
        cast_prog, cast_user
      )
      USING program_id_text, user_id_text, format('Week %s Check-in', i), i;
    END IF;
  END LOOP;

  RAISE NOTICE 'Seeded program "ANX Orientation" (%) for user %', program_id_text, user_id_text;
END $$;

COMMIT;
