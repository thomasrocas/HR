import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const GOOGLE_SCOPE = ['profile', 'email'] as const;

const isAccountDisabled = (status: unknown): boolean => typeof status === 'string'
  && ['suspended', 'archived'].includes(status.trim().toLowerCase());

const readEnv = (key: string, fallback: string): string => {
  const raw = process.env[key];
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  return trimmed === '' ? fallback : trimmed;
};

const computeCallbackUrl = (): string => {
  const GOOGLE_CALLBACK_PATH = '/google/callback';
  const defaultBase = readEnv(
    'PUBLIC_URL',
    readEnv(
      'SERVER_PUBLIC_URL',
      readEnv('APP_BASE_URL', 'https://anxlife.net')
    )
  ).replace(/\/$/, '');
  return readEnv('GOOGLE_CALLBACK_URL', `${defaultBase}${GOOGLE_CALLBACK_PATH}`);
};

let googleStrategyConfigured = false;

const ensureGoogleStrategy = (pool: Pool) => {
  if (googleStrategyConfigured) {
    return;
  }
  const GOOGLE_CALLBACK_URL = computeCallbackUrl();
  passport.use(new GoogleStrategy({
    clientID: readEnv('GOOGLE_CLIENT_ID', '80329949703-haj7aludbp14ma3fbg4h97rna0ngbn28.apps.googleusercontent.com'),
    clientSecret: readEnv('GOOGLE_CLIENT_SECRET', 'ZHhm_oFXdv7C9FELx-bSdsmt'),
    callbackURL: GOOGLE_CALLBACK_URL,
    proxy: true
  }, async (_at: unknown, _rt: unknown, profile: any, done: Function) => {
    try {
      const email = profile.emails?.[0]?.value || null;
      const name = profile.displayName || null;
      const picture = profile.photos?.[0]?.value || null;

      const insertUser = `
        insert into public.users (google_id, email, full_name, picture_url, provider)
        values ($1,$2,$3,$4,'google')
        on conflict (google_id) do update
        set email=excluded.email, full_name=excluded.full_name, picture_url=excluded.picture_url, updated_at=now()
        returning *;`;
      let user;
      try {
        const { rows } = await pool.query(insertUser, [profile.id, email, name, picture]);
        user = rows[0];
      } catch (err: any) {
        if (err?.code === '23505' && err?.constraint === 'users_email_unique_ci' && email) {
          const updateByEmail = `
            update public.users
               set google_id   = $1,
                   full_name   = $2,
                   picture_url = $3,
                   provider    = 'google',
                   updated_at  = now()
             where lower(email) = lower($4)
             returning *;`;
          const { rows } = await pool.query(updateByEmail, [profile.id, name, picture, email]);
          user = rows[0];
        } else {
          throw err;
        }
      }
      if (!user) {
        return done(null, false, { message: 'account_conflict' });
      }
      if (isAccountDisabled(user?.status)) {
        return done(null, false, { message: 'account_disabled' });
      }
      try {
        await pool.query(
          `insert into public.user_roles(user_id, role_id)
           select $1, role_id from roles where role_key = $2
           on conflict do nothing`,
          [user.id, process.env.DEFAULT_ROLE || 'viewer']
        );
      } catch (_e) {
        /* ignore role seeding errors */
      }
      return done(null, user);
    } catch (e) {
      return done(e);
    }
  }));
  googleStrategyConfigured = true;
};

export const createLegacyGoogleCallbackHandler = (pool: Pool) => {
  ensureGoogleStrategy(pool);
  return (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('google', (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        const message = info?.message || 'auth_failed';
        const status = message === 'account_disabled' ? 403 : 401;
        if (req.accepts('json')) {
          return res.status(status).json({ error: message });
        }
        res.status(status);
        return res.send(`Authentication failed: ${message}`);
      }
      req.login(user, async (loginErr: unknown) => {
        if (loginErr) return next(loginErr);
        try {
          await pool.query(`
            insert into public.user_preferences (user_id, trainee)
            values ($1, $2)
            on conflict (user_id) do nothing;`,
            [req.user.id, req.user.id]
          );
        } catch (_e) {
          /* ignore if preferences table is absent */
        }
        if (req.session && req.user?.id) {
          req.session.trainee = req.user.id;
        }
        return res.redirect('/');
      });
    })(req, res, next);
  };
};

export const buildLegacyAuthRouter = (pool: Pool) => {
  ensureGoogleStrategy(pool);
  const router = Router();
  router.get('/google', passport.authenticate('google', { scope: GOOGLE_SCOPE }));
  const handleGoogleCallback = createLegacyGoogleCallbackHandler(pool);
  router.get('/google/callback', handleGoogleCallback);
  return router;
};
