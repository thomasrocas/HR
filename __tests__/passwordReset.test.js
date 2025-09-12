const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { newDb } = require('pg-mem');

// Mock pg to use pg-mem
const db = newDb();
const { Pool: MockPool } = db.adapters.createPg();
jest.mock('pg', () => ({ Pool: MockPool }));

// Mock nodemailer to avoid real email sending
const mockSendMail = jest.fn().mockResolvedValue(true);
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: mockSendMail })
}));

// Require app after mocks
const { app, pool } = require('../orientation_server.js');

beforeAll(async () => {
  await pool.query(`
    create table public.users (
      id uuid primary key,
      username text unique,
      email text,
      full_name text,
      password_hash text,
      provider text,
      password_reset_token text,
      password_reset_expires timestamptz,
      updated_at timestamptz
    );
  `);
});

afterEach(async () => {
  await pool.query('delete from public.users');
  mockSendMail.mockClear();
});

test('forgot sets token and expiry', async () => {
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash('oldpass', 1);
  await pool.query('insert into public.users(id, username, email, password_hash, provider) values ($1,$2,$3,$4,$5)', [id, 'alice', 'alice@example.com', hash, 'local']);

  await request(app).post('/auth/local/forgot').send({ identifier: 'alice' }).expect(200);

  const { rows } = await pool.query('select password_reset_token, password_reset_expires from public.users where id=$1', [id]);
  expect(rows[0].password_reset_token).toBeTruthy();
  expect(rows[0].password_reset_token.length).toBe(64);
  expect(new Date(rows[0].password_reset_expires) > new Date()).toBe(true);
  expect(mockSendMail).toHaveBeenCalled();
});

test('reset rejects expired token', async () => {
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash('oldpass', 1);
  const token = 'tok123';
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const past = new Date(Date.now() - 1000);
  await pool.query('insert into public.users(id, username, password_hash, provider, password_reset_token, password_reset_expires) values ($1,$2,$3,$4,$5,$6)', [id, 'bob', hash, 'local', hashed, past]);

  await request(app).post('/auth/local/reset').send({ token, password: 'newpass123' }).expect(400);

  const { rows } = await pool.query('select password_reset_token from public.users where id=$1', [id]);
  expect(rows[0].password_reset_token).toBe(hashed);
});

test('reset updates password and clears fields', async () => {
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash('oldpass', 1);
  const token = 'tok456';
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const future = new Date(Date.now() + 3600000);
  await pool.query('insert into public.users(id, username, password_hash, provider, password_reset_token, password_reset_expires) values ($1,$2,$3,$4,$5,$6)', [id, 'carol', hash, 'local', hashed, future]);

  await request(app).post('/auth/local/reset').send({ token, password: 'brandnewpass' }).expect(200);

  const { rows } = await pool.query('select password_hash, password_reset_token, password_reset_expires from public.users where id=$1', [id]);
  expect(await bcrypt.compare('brandnewpass', rows[0].password_hash)).toBe(true);
  expect(rows[0].password_reset_token).toBeNull();
  expect(rows[0].password_reset_expires).toBeNull();
});
