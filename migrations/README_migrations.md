# Database Migrations — How To (Beginner Friendly)

This guide shows you (and your team) how to **add, run, and verify** database migrations for the `orientation` PostgreSQL database, using the `migrations/` folder in this repo.

---

## What are migrations (in plain English)?
- A **migration** is a small SQL file that changes the database (create tables, add columns, add triggers, seed data, etc.).
- Migrations are **run in order** (usually by filename).
- Old migrations are **history**. Don’t rewrite them after they’ve run in any environment. Instead, **add a new file** for new changes.

---

## Folder layout & file order
Migrations live in the `migrations/` folder. Example (your repo):
```
migrations/
  002_rbac.sql                   <-- baseline (for fresh DBs only; do not re-run)
  002b_create_audit_function.sql <-- creates audit function used by triggers
  002_rbac_fix.sql               <-- fixes/normalizes RBAC; idempotent
  003_seed_admin.sql             <-- seeds initial admin user/role
```

> **Why the “002b” file?** File names sort alphabetically. The audit function must exist **before** the fix script recreates triggers, so `002b_...` ensures the function comes first.

---

## One-time setup (recommended): Migration ledger
Create a ledger table so each migration records itself once. This prevents re-applying the same file.

```sql
CREATE TABLE IF NOT EXISTS public.schema_migrations(
  name text PRIMARY KEY,
  applied_at timestamptz DEFAULT now()
);
```

After you run a migration successfully, insert its name:
```sql
INSERT INTO public.schema_migrations(name) VALUES
 ('002_rbac.sql'),
 ('002b_create_audit_function.sql'),
 ('002_rbac_fix.sql'),
 ('003_seed_admin.sql')
ON CONFLICT DO NOTHING;
```

> Later, CI (or a simple script) can check this table and only run **new** files.

---

## How to run migrations **locally**

### 1) Make sure `psql` can connect
- **Host:** `localhost`
- **Port:** `5432`
- **DB:** `orientation`
- **User:** `postgres`
- **Password:** (whatever you set)

### 2) Windows (CMD)
```bat
:: in your repo root
set PGPASSWORD=@DbAdmin@

psql -h localhost -p 5432 -U postgres -d orientation -f "migrations\002_rbac.sql"                  
psql -h localhost -p 5432 -U postgres -d orientation -f "migrations\002b_create_audit_function.sql"
psql -h localhost -p 5432 -U postgres -d orientation -f "migrations\002_rbac_fix.sql"
psql -h localhost -p 5432 -U postgres -d orientation -f "migrations\003_seed_admin.sql"
```

### 3) PowerShell
```powershell
$env:PGPASSWORD='@DbAdmin@'
psql -h localhost -p 5432 -U postgres -d orientation -f ".\migrations_rbac.sql"
psql -h localhost -p 5432 -U postgres -d orientation -f ".\migrationsb_create_audit_function.sql"
psql -h localhost -p 5432 -U postgres -d orientation -f ".\migrations_rbac_fix.sql"
psql -h localhost -p 5432 -U postgres -d orientation -f ".\migrations_seed_admin.sql"
```

### 4) macOS / Linux
```bash
export PGPASSWORD='@DbAdmin@'
psql -h localhost -p 5432 -U postgres -d orientation -f migrations/002_rbac.sql
psql -h localhost -p 5432 -U postgres -d orientation -f migrations/002b_create_audit_function.sql
psql -h localhost -p 5432 -U postgres -d orientation -f migrations/002_rbac_fix.sql
psql -h localhost -p 5432 -U postgres -d orientation -f migrations/003_seed_admin.sql
```

> **Tip:** `002_rbac.sql` is your *baseline* for a fresh database. On an already-initialized DB, **don’t re-run it** (it will complain about existing triggers and old seed data). Use the newer migrations.

---

## Verifying RBAC after running

```sql
-- 1) No NULL mappings (should be 0)
SELECT COUNT(*) AS null_perm_mappings
FROM public.role_permissions
WHERE perm_id IS NULL;

-- 2) Permissions catalog (source of truth)
SELECT perm_key, description
FROM public.permissions
ORDER BY perm_key;

-- 3) Roles & how many permissions each has
SELECT r.role_key, COUNT(*) AS perms_assigned
FROM public.roles r
JOIN public.role_permissions rp ON rp.role_id = r.role_id
GROUP BY r.role_key
ORDER BY r.role_key;

-- 4) Assign a role to a user (replace with a real user_id)
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'PUT-USER-ID-HERE', r.role_id
FROM public.roles r
WHERE r.role_key = 'manager'
ON CONFLICT DO NOTHING;

-- 5) List a user's effective permissions
SELECT DISTINCT p.perm_key
FROM public.user_roles ur
JOIN public.role_permissions rp ON rp.role_id = ur.role_id
JOIN public.permissions p       ON p.perm_id = rp.perm_id
WHERE ur.user_id = 'PUT-USER-ID-HERE'
ORDER BY p.perm_key;
```

> **Source of truth:** `public.permissions.perm_key` is the canonical list of permissions. Roles map to permissions via `role_permissions (role_id, perm_id)`.

---

## Daily GitHub workflow (simple)

1) **Create or edit migration files** in `migrations/`.  
   - New change? Add a **new** file (e.g., `004_add_whatever.sql`).  
   - Don’t edit or renumber old files that already ran in any environment.
2) **Commit & push** (or use GitHub Web UI “Commit changes”).  
3) Open a **Pull Request** and **merge** when approved.
4) **Apply** the new migrations to your DB(s):  
   - Locally with `psql` (above), or  
   - Automatically via **GitHub Actions** (below).

---

## (Optional) Run migrations via GitHub Actions

> Use this if your DB is reachable from GitHub or you have a **self-hosted runner** in your network.

1) Add repository **Secrets**: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`  
   (Repo → Settings → Secrets and variables → Actions → New repository secret)

2) Create `.github/workflows/migrate.yml`:
```yaml
name: Run DB migrations

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'migrations/**'

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install PostgreSQL client
        run: sudo apt-get update && sudo apt-get install -y postgresql-client

      - name: Run migrations (idempotent, ordered)
        env:
          DB_HOST:     ${{ secrets.DB_HOST }}
          DB_PORT:     ${{ secrets.DB_PORT }}
          DB_NAME:     ${{ secrets.DB_NAME }}
          DB_USER:     ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
        run: |
          set -e
          export PGPASSWORD="$DB_PASSWORD"
          psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c             "CREATE TABLE IF NOT EXISTS public.schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now());"

          for f in $(ls migrations/*.sql | sort); do
            base=$(basename "$f")
            already=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc               "SELECT 1 FROM public.schema_migrations WHERE name='${base}'")
            if [ "$already" = "1" ]; then
              echo "Skipping $base (already applied)"
            else
              echo "Applying $base"
              psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$f"
              psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c                 "INSERT INTO public.schema_migrations(name) VALUES ('${base}');"
              echo "Applied $base"
            fi
          done
```

> If your DB is **only on your laptop**, GitHub’s runners can’t reach `localhost`. Either keep running `psql` locally or set up a **self-hosted runner** on the same network as your DB.

---

## Common pitfalls & fixes

- **Re-running a baseline file** (`002_rbac.sql`): you’ll see errors like “trigger already exists”, “column perm_key doesn’t exist” (we removed that column), or foreign-key failures on old seed rows. **Solution:** don’t re-run the baseline on an initialized DB—run only the newer migrations.
- **Function not found for triggers:** run `002b_create_audit_function.sql` before any migration that creates `audit_*` triggers.
- **Wrong role PK name:** your `roles` table uses `role_id` (not `id`). Join on `r.role_id`.
- **Permissions join:** `role_permissions` uses `perm_id`; join to `permissions.perm_id` (not `p.id`).

---

## Quick reference queries

```sql
-- Describe tables (psql)
\d public.roles
\d public.permissions
\d public.role_permissions

-- Confirm audit triggers exist
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_name LIKE 'audit_%'
ORDER BY 1,2;

-- Check that the audit function exists
SELECT n.nspname, p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'audit_row_change' AND n.nspname = 'public';
```

---

## Need help?
If a migration fails, copy the **exact error text** and the file name/line number. That’s the fastest way to debug and write a follow-up migration.

Happy shipping 👊
