import type { Pool } from 'pg';

export interface EnsureUserParams {
  email: string;
  displayName?: string | null;
}

export interface AppUser {
  user_id: string;
  email: string;
  display_name: string | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const UPSERT_SQL = `
  insert into app_users (email, display_name, created_at, updated_at, last_login_at)
  values ($1, $2, now(), now(), now())
  on conflict (email) do update
    set display_name = coalesce(excluded.display_name, app_users.display_name),
        last_login_at = now(),
        updated_at = now()
  returning user_id, email, display_name, last_login_at, created_at, updated_at;
`;

const TOUCH_SQL = `
  update app_users
     set last_login_at = now(),
         updated_at = now()
   where email = $1
  returning user_id, email, display_name, last_login_at, created_at, updated_at;
`;

export async function ensureUser(pool: Pool, params: EnsureUserParams): Promise<AppUser | null> {
  const email = params.email?.trim().toLowerCase();
  const displayName = params.displayName?.trim() ?? null;
  if (!email) {
    throw new Error('email_required');
  }

  const result = await pool.query<AppUser>(UPSERT_SQL, [email, displayName]);
  if (result.rowCount) {
    return result.rows[0];
  }

  const touch = await pool.query<AppUser>(TOUCH_SQL, [email]);
  return touch.rows[0] ?? null;
}
