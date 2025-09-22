ALTER TABLE public.user_preferences
    ADD COLUMN IF NOT EXISTS due_date date,
    ADD COLUMN IF NOT EXISTS notes text;
