import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // AI is optional at boot so the server can run for QR pairing without a key,
  // but AI endpoints will return a clear error until it is set.
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  WA_SESSION_PATH: z.string().default('./.sessions'),
  SESSION_ENCRYPTION_KEY: z
    .string()
    .min(8, 'SESSION_ENCRYPTION_KEY must be at least 8 chars')
    .default('dev-insecure-session-key-change-me'),

  CORS_ORIGIN: z.string().default('*'),
  DEFAULT_TRANSLATE_TO: z.string().default('en'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message instead of a cryptic stack trace.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`❌ Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProd = env.NODE_ENV === 'production';
