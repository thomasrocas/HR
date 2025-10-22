-- migrations/20250912_rbac_rollback.sql
-- Roll back RBAC + RLS changes introduced in 20250912_rbac.sql

BEGIN;

-- 1) Drop RLS policies (order: most specific first)
DROP POLICY IF EXISTS tasks_complete_self ON public.orientation_tasks;
DROP POLICY IF EXISTS tasks_write_manager ON public.orientation_tasks;
DROP POLICY IF EXISTS tasks_read ON public.orientation_tasks;

DROP POLICY IF EXISTS templates_write ON public.program_task_templates;
DROP POLICY IF EXISTS templates_read  ON public.program_task_templates;

DROP POLICY IF EXISTS programs_write ON public.programs;
DROP POLICY IF EXISTS programs_read  ON public.programs;

-- 2) Disable RLS on domain tables (revert to pre-RBAC behavior)
ALTER TABLE public.orientation_tasks        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_task_templates   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs                 DISABLE ROW LEVEL SECURITY;

-- 3) Remove helper function/schema used by policies
DROP FUNCTION IF EXISTS app.csv_int_array(text);
DROP SCHEMA IF EXISTS app CASCADE;

-- 4) Drop performance/helper indexes created by the RBAC migration
DROP INDEX IF EXISTS ptt_prog_wk_sort_idx;
DROP INDEX IF EXISTS ot_prog_user_wk_idx;
DROP INDEX IF EXISTS pm_user_prog_idx;
DROP INDEX IF EXISTS ur_user_scope_idx;
DROP INDEX IF EXISTS user_roles_unique_idx;
DROP INDEX IF EXISTS audit_log_entity_idx;

-- 5) Drop RBAC tables (dependency-safe order)
DROP TABLE IF EXISTS public.role_permissions;
DROP TABLE IF EXISTS public.user_roles;
DROP TABLE IF EXISTS public.program_memberships;
DROP TABLE IF EXISTS public.permissions;
DROP TABLE IF EXISTS public.roles;
DROP TABLE IF EXISTS public.audit_log;

COMMIT;
