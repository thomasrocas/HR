import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';

const resolveEnvFile = (): string | undefined => {
  const nodeEnv = (process.env.NODE_ENV || 'development').trim();
  if (nodeEnv === 'production') {
    const productionPath = path.resolve(process.cwd(), '.env.production');
    return fs.existsSync(productionPath) ? productionPath : undefined;
  }
  const defaultPath = path.resolve(process.cwd(), '.env');
  return fs.existsSync(defaultPath) ? defaultPath : undefined;
};

const envFilePath = resolveEnvFile();
if (envFilePath) {
  loadEnv({ path: envFilePath });
} else {
  loadEnv();
}

const readEnv = (key: string, fallback: string): string => {
  const raw = process.env[key];
  if (typeof raw !== 'string') {
    return fallback;
  }
  const trimmed = raw.trim();
  return trimmed === '' ? fallback : trimmed;
};

const parsePort = (value: string | undefined, fallback: number): number => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 't', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'f', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const parseCorsOrigins = (raw: string | undefined): string[] => {
  if (typeof raw !== 'string') {
    return [];
  }
  return raw
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
};

const GOOGLE_CALLBACK_PATH = '/google/callback';
const DEFAULT_CALLBACK_BASE = readEnv(
  'PUBLIC_URL',
  readEnv(
    'SERVER_PUBLIC_URL',
    readEnv('APP_BASE_URL', 'https://anxlife.net')
  )
).replace(/\/$/, '');

const config = {
  env: (process.env.NODE_ENV || 'development').trim(),
  server: {
    port: parsePort(process.env.PORT, 3002),
    corsOrigin: parseCorsOrigins(process.env.CORS_ORIGIN),
    sessionSecret: readEnv('SESSION_SECRET', 'dev-change-me'),
    trustProxy: parseBoolean(process.env.TRUST_PROXY, true),
  },
  db: {
    url: readEnv('DATABASE_URL', ''),
  },
  oauth: {
    googleClientId: readEnv('GOOGLE_CLIENT_ID', '80329949703-haj7aludbp14ma3fbg4h97rna0ngbn28.apps.googleusercontent.com'),
    googleClientSecret: readEnv('GOOGLE_CLIENT_SECRET', 'ZHhm_oFXdv7C9FELx-bSdsmt'),
    googleCallbackUrl: readEnv('GOOGLE_CALLBACK_URL', `${DEFAULT_CALLBACK_BASE}${GOOGLE_CALLBACK_PATH}`),
  },
};

export type AppConfig = typeof config;

export default config;
