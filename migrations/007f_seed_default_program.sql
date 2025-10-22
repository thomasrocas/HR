
-- 007f_seed_default_program.sql (v2)
-- Robust seeder for default program + starter tasks.
-- Handles NOT NULL orientation_tasks.trainee of type text/uuid/boolean by embedding a literal.
-- Idempotent.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

DO $$
DECLARE
  -- programs table
  prog_pk_type text;
  prog_title_col text;
  prog_start_col text;
  prog_weeks_col text;

  -- users table
  user_pk_type text;

  -- program_memberships shape
  pm_has_role_id boolean := false;
  pm_role_text_col text := NULL;

  -- orientation_tasks shape
  ot_label_col text;
  ot_has_week boolean := false;
  ot_has_day  boolean := false;
  ot_has_sched boolean := false;
  ot_has_deleted boolean := false;
  ot_has_trainee boolean := false;
  trainee_type text := NULL;
  sched_col text := NULL;

  -- casting helpers
  cast_prog text;  -- '$1::uuid' or '$1'
  cast_user text;  -- '$2::uuid' or '$2'

  -- working values
  program_id_text text;
  program_id_found text;
  start_date date := NULL;
  user_id_text text;
  trainee_role_id int := NULL;

  trainee_name text := NULL;

  -- dynamic sql parts for task insert
  col_list text;
  val_list text;
  cond_text text;
  sql text;

  -- loop vars
  i int;
  label_text text;
  week_val int;
  sched_val date;
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

  SELECT COALESCE(full_name, email, username::text) INTO trainee_name
  FROM public.users WHERE id::text = user_id_text;
  IF trainee_name IS NULL THEN
    trainee_name := 'Trainee';
  END IF;

  -- Detect programs schema
  SELECT data_type INTO prog_pk_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='programs' AND column_name='program_id';

  IF prog_pk_type IS NULL THEN
    RAISE EXCEPTION 'public.programs must have program_id';
  END IF;

  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='programs' AND column_name='title') THEN 'title'
           WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='programs' AND column_name='name') THEN 'name'
           ELSE NULL
         END,
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='programs' AND column_name='start_date') THEN 'start_date' ELSE NULL END,
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='programs' AND column_name='weeks') THEN 'weeks' ELSE NULL END
  INTO prog_title_col, prog_start_col, prog_weeks_col;

  IF prog_title_col IS NULL THEN
    RAISE EXCEPTION 'programs needs a title or name column';
  END IF;

  IF prog_pk_type = 'uuid' THEN
    cast_prog := '$1::uuid';
  ELSE
    cast_prog := '$1';
  END IF;

  -- Detect users.id type
  SELECT data_type INTO user_pk_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name='id';
  IF user_pk_type = 'uuid' THEN
    cast_user := '$2::uuid';
  ELSE
    cast_user := '$2';
  END IF;

  -- Detect program_memberships shape (optional table)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='program_memberships') THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='program_memberships' AND column_name='role_id')
    INTO pm_has_role_id;

    SELECT CASE
             WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='program_memberships' AND column_name='role_key') THEN 'role_key'
             WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='program_memberships' AND column_name='role') THEN 'role'
             ELSE NULL
           END
    INTO pm_role_text_col;

    IF pm_has_role_id THEN
      SELECT role_id INTO trainee_role_id FROM public.roles WHERE role_key='trainee' LIMIT 1;
      IF trainee_role_id IS NULL THEN
        SELECT role_id INTO trainee_role_id FROM public.roles LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- Detect orientation_tasks shape
  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orientation_tasks' AND column_name='label') THEN 'label'
           WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orientation_tasks' AND column_name='title') THEN 'title'
           WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orientation_tasks' AND column_name='name') THEN 'name'
           ELSE NULL
         END
  INTO ot_label_col;

  IF ot_label_col IS NULL THEN
    RAISE EXCEPTION 'orientation_tasks needs a label/title/name column';
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orientation_tasks' AND column_name='week'),
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orientation_tasks' AND column_name='day_of_week'),
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orientation_tasks' AND column_name='scheduled_for'),
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orientation_tasks' AND column_name='deleted'),
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orientation_tasks' AND column_name='trainee')
  INTO ot_has_week, ot_has_day, ot_has_sched, ot_has_deleted, ot_has_trainee;

  IF ot_has_trainee THEN
    SELECT data_type INTO trainee_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orientation_tasks' AND column_name='trainee';
  END IF;

  IF ot_has_sched THEN
    sched_col := 'scheduled_for';
  END IF;

  -- Reuse or create ANX Orientation program
  EXECUTE format('SELECT program_id::text FROM public.programs WHERE %I = $1 LIMIT 1', prog_title_col)
    INTO program_id_found
  USING 'ANX Orientation';

  IF program_id_found IS NOT NULL THEN
    program_id_text := program_id_found;
  ELSE
    program_id_text := CASE WHEN prog_pk_type='uuid' THEN gen_random_uuid()::text ELSE 'anx-orientation' END;

    IF prog_start_col IS NOT NULL AND prog_weeks_col IS NOT NULL THEN
      EXECUTE format('INSERT INTO public.programs(program_id, %I, %I, %I) VALUES (%s, $1, $2, $3)',
                     prog_title_col, prog_start_col, prog_weeks_col, cast_prog)
      USING program_id_text, 'ANX Orientation', current_date, 6;
      start_date := current_date;
    ELSE
      EXECUTE format('INSERT INTO public.programs(program_id, %I) VALUES (%s, $1)',
                     prog_title_col, cast_prog)
      USING program_id_text, 'ANX Orientation';
      IF prog_start_col IS NOT NULL THEN
        EXECUTE format('SELECT %I FROM public.programs WHERE program_id::text=$1', prog_start_col)
          INTO start_date
        USING program_id_text;
      END IF;
    END IF;
  END IF;

  -- Ensure membership
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='program_memberships') THEN
    IF pm_has_role_id THEN
      EXECUTE format('INSERT INTO public.program_memberships(program_id, user_id, role_id)
                      SELECT %s, %s, $3
                      WHERE NOT EXISTS (SELECT 1 FROM public.program_memberships WHERE program_id::text=$1 AND user_id::text=$2)',
                      cast_prog, cast_user)
      USING program_id_text, user_id_text, trainee_role_id;
    ELSIF pm_role_text_col IS NOT NULL THEN
      EXECUTE format('INSERT INTO public.program_memberships(program_id, user_id, %I)
                      SELECT %s, %s, $3
                      WHERE NOT EXISTS (SELECT 1 FROM public.program_memberships WHERE program_id::text=$1 AND user_id::text=$2)',
                      pm_role_text_col, cast_prog, cast_user)
      USING program_id_text, user_id_text, 'trainee';
    ELSE
      EXECUTE format('INSERT INTO public.program_memberships(program_id, user_id)
                      SELECT %s, %s
                      WHERE NOT EXISTS (SELECT 1 FROM public.program_memberships WHERE program_id::text=$1 AND user_id::text=$2)',
                      cast_prog, cast_user)
      USING program_id_text, user_id_text;
    END IF;
  END IF;

  -- Build dynamic parts for inserting tasks
  col_list := 'program_id, user_id, ' || quote_ident(ot_label_col);
  val_list := format('%s, %s, $3', cast_prog, cast_user);
  cond_text := format('program_id::text=$1 AND user_id::text=$2 AND %I=$3', ot_label_col);

  -- Include trainee if column exists
  IF ot_has_trainee THEN
    col_list := 'trainee, ' || col_list;
    IF trainee_type = 'boolean' THEN
      val_list := 'true, ' || val_list;
    ELSIF trainee_type = 'uuid' THEN
      val_list := quote_literal(user_id_text) || '::uuid, ' || val_list;
    ELSE
      -- treat as text
      val_list := quote_literal(trainee_name) || ', ' || val_list;
    END IF;
  END IF;

  IF ot_has_week THEN
    col_list := col_list || ', week';
    val_list := val_list || ', $4';
    cond_text := cond_text || ' AND week=$4';
  END IF;

  IF ot_has_day THEN
    col_list := col_list || ', day_of_week';
    val_list := val_list || ', 1'; -- Monday
  END IF;

  IF ot_has_sched THEN
    col_list := col_list || ', ' || quote_ident(sched_col);
    IF ot_has_week THEN
      val_list := val_list || ', $5';
    ELSE
      val_list := val_list || ', $4';
    END IF;
  END IF;

  IF ot_has_deleted THEN
    col_list := col_list || ', deleted';
    val_list := val_list || ', false';
  END IF;

  sql := 'INSERT INTO public.orientation_tasks (' || col_list || ') ' ||
         'SELECT ' || val_list ||
         ' WHERE NOT EXISTS (SELECT 1 FROM public.orientation_tasks WHERE ' || cond_text || ')';

  -- Insert Week 1..6
  FOR i IN 1..6 LOOP
    label_text := format('Week %s Check-in', i);
    week_val := i;
    IF ot_has_sched AND start_date IS NOT NULL THEN
      sched_val := current_date + (i-1) * 7;
    ELSE
      sched_val := NULL;
    END IF;

    IF ot_has_week AND ot_has_sched THEN
      EXECUTE sql USING program_id_text, user_id_text, label_text, week_val, sched_val;
    ELSIF ot_has_week AND NOT ot_has_sched THEN
      EXECUTE sql USING program_id_text, user_id_text, label_text, week_val;
    ELSIF NOT ot_has_week AND ot_has_sched THEN
      EXECUTE sql USING program_id_text, user_id_text, label_text, sched_val;
    ELSE
      EXECUTE sql USING program_id_text, user_id_text, label_text;
    END IF;
  END LOOP;

  RAISE NOTICE 'Seeded "ANX Orientation" (%) for user %', program_id_text, user_id_text;
END $$;

COMMIT;
