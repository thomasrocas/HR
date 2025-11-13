DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'app_users'
       AND indexname = 'ux_app_users_email'
  ) THEN
    CREATE UNIQUE INDEX ux_app_users_email
      ON public.app_users (email);
  END IF;
END
$$;
