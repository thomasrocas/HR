const request = require('supertest');
const crypto = require('crypto');
const passport = require('passport');
const { newDb } = require('pg-mem');

const db = newDb();
const { Pool: MockPool } = db.adapters.createPg();

db.public.registerFunction({
  name: 'to_timestamp',
  args: ['text'],
  returns: 'timestamptz',
  implementation: x => new Date(Number(x) * 1000)
});

db.public.registerFunction({
  name: 'gen_random_uuid',
  returns: 'uuid',
  implementation: () => crypto.randomUUID()
});

jest.mock('pg', () => ({ Pool: MockPool }));

const { app, pool } = require('../orientation_server.js');

describe('google auth flow', () => {
  beforeAll(async () => {
    await pool.query(`
      create table public.users (
        id uuid primary key default gen_random_uuid(),
        username text unique,
        email text,
        full_name text,
        organization text,
        discipline text,
        discipline_type text,
        last_name text,
        surname text,
        first_name text,
        department text,
        sub_unit text,
        status text default 'active' not null,
        password_hash text,
        provider text,
        google_id text unique,
        picture_url text,
        created_at timestamptz,
        last_login_at timestamptz,
        updated_at timestamptz
      );
      create table public.session (
        sid text primary key,
        sess text not null,
        expire timestamptz not null
      );
      create table public.roles (
        role_id serial primary key,
        role_key text unique,
        description text
      );
      create table public.user_roles (
        user_id uuid,
        role_id int references public.roles(role_id)
      );
      create table public.role_permissions (
        role_id int references public.roles(role_id),
        perm_key text
      );
      create table public.user_preferences (
        user_id uuid primary key,
        trainee uuid
      );
      insert into public.roles(role_key) values ('viewer');
    `);
  });

  afterEach(async () => {
    await pool.query('delete from public.user_preferences');
    await pool.query('delete from public.user_roles');
    await pool.query('delete from public.users');
    await pool.query('delete from public.session');
  });

  test.each(['suspended', 'archived'])('strategy rejects %s users', async status => {
    await pool.query(
      `insert into public.users (google_id, email, full_name, status, provider)
       values ($1, $2, $3, $4, 'google')`,
      [`google-${status}`, `${status}@example.com`, 'Disabled User', status]
    );

    const profile = {
      id: `google-${status}`,
      displayName: 'Disabled User',
      emails: [{ value: `${status}@example.com` }],
      photos: [{ value: 'https://example.com/pic.png' }]
    };

    const strategy = passport._strategy('google');

    await expect(new Promise((resolve, reject) => {
      strategy._verify.call(strategy, 'token', 'refresh', profile, (err, user, info) => {
        try {
          expect(err).toBeNull();
          expect(user).toBe(false);
          expect(info).toEqual({ message: 'account_disabled' });
          resolve();
        } catch (assertErr) {
          reject(assertErr);
        }
      });
    })).resolves.toBeUndefined();
  });

  test('callback surfaces account_disabled failure', async () => {
    const authenticateSpy = jest.spyOn(passport, 'authenticate').mockImplementation((_name, callback) => {
      return (req, res, _next) => callback(null, false, { message: 'account_disabled' });
    });

    try {
      const res = await request(app)
        .get('/auth/google/callback')
        .set('Accept', 'application/json')
        .expect(403);

      expect(res.body).toEqual({ error: 'account_disabled' });
    } finally {
      authenticateSpy.mockRestore();
    }
  });
});
