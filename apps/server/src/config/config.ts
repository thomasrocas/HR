import path from "path";
import dotenv from "dotenv";

const resolveEnvFile = (): string => {
  const env = process.env.NODE_ENV ?? "development";
  const filename = env === "production" ? ".env.production" : ".env";
  return path.resolve(process.cwd(), filename);
};

const loadEnv = () => {
  const primaryPath = resolveEnvFile();
  const primaryResult = dotenv.config({ path: primaryPath });

  if (primaryResult.error && process.env.NODE_ENV === "production") {
    dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  }
};

loadEnv();

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toStringArray = (
  value: string | undefined,
  fallback: string[]
): string[] => {
  if (!value) {
    return fallback;
  }

  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : fallback;
};

type Config = {
  env: string;
  server: {
    port: number;
    corsOrigin: string[];
    sessionSecret: string;
  };
  db: {
    url: string;
  };
  oauth: {
    googleClientId: string;
    googleClientSecret: string;
    googleCallbackUrl: string;
  };
  mail: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    from: string;
  };
};

const config: Config = {
  env: process.env.NODE_ENV ?? "development",
  server: {
    port: toNumber(process.env.PORT, 3000),
    corsOrigin: toStringArray(process.env.CORS_ORIGIN, ["http://localhost:3000"]),
    sessionSecret:
      process.env.SESSION_SECRET ?? "replace-with-secure-random-string",
  },
  db: {
    url:
      process.env.DATABASE_URL ??
      "postgres://user:password@localhost:5432/hr_orientation",
  },
  oauth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    googleCallbackUrl:
      process.env.GOOGLE_CALLBACK_URL ??
      "http://localhost:3000/auth/google/callback",
  },
  mail: {
    smtpHost: process.env.SMTP_HOST ?? "smtp.example.com",
    smtpPort: toNumber(process.env.SMTP_PORT, 587),
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPass: process.env.SMTP_PASS ?? "",
    from: process.env.MAIL_FROM ?? "HR Orientation <noreply@example.com>",
  },
};

export default config;
