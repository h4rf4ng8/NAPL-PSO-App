import { z } from 'zod';

const schema = z.object({
  TRUST_CLOUDFRONT: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  LOG_LEVEL: z.enum(['debug', 'info']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().pipe(z.int().min(1).max(65_535)).default(3000),
  HOST: z.string().default('127.0.0.1'),
  PUBLIC_ORIGIN: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_JWKS_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  DISCORD_TRANSFER_WEBHOOK: z.preprocess(value => value === '' ? undefined : value, z.url().optional()),
});

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const config = schema.parse(environment);
  const origin = new URL(config.PUBLIC_ORIGIN);
  if (origin.origin !== config.PUBLIC_ORIGIN || (config.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
    throw new Error('PUBLIC_ORIGIN must be an exact origin; production requires HTTPS');
  }
  for (const name of ['SUPABASE_URL', 'SUPABASE_JWKS_URL'] as const) {
    const url = new URL(config[name]);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error(`${name} must be an HTTP(S) URL without credentials, query or fragment`);
    }
    if (config.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new Error(`${name} must use HTTPS in production`);
    }
  }
  if (config.NODE_ENV === 'production' && config.DISCORD_TRANSFER_WEBHOOK && new URL(config.DISCORD_TRANSFER_WEBHOOK).protocol !== 'https:') {
    throw new Error('DISCORD_TRANSFER_WEBHOOK must use HTTPS in production');
  }
  if (config.NODE_ENV === 'production') {
    const url = new URL(config.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.searchParams.get('sslmode') !== 'verify-full') {
      throw new Error('DATABASE_URL must use PostgreSQL with sslmode=verify-full in production');
    }
  }
  return config;
}

export type Config = ReturnType<typeof readConfig>;
