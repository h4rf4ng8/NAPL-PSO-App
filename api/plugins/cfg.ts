import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  PUBLIC_ORIGIN: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.preprocess(value => value === '' ? undefined : value, z.string().startsWith('sb_secret_').optional()),
  SUPABASE_JWT_AUDIENCE: z.string().default('authenticated'),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_GUILD_ID: z.string().regex(/^\d+$/),
  DATABASE_URL: z.string().min(1),
  AUTH_DATABASE_URL: z.string().min(1),
  COOKIE_KEYS: z.string().min(1),
  DISCORD_TRANSFER_WEBHOOK: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()),
  ORIGIN_SECRET: z.string().min(32),
});

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const config = schema.parse(environment);
  const origin = new URL(config.PUBLIC_ORIGIN);
  if (origin.origin !== config.PUBLIC_ORIGIN || (config.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
    throw new Error('PUBLIC_ORIGIN must be an exact origin; production requires HTTPS');
  }
  if (config.NODE_ENV === 'production' && new URL(config.SUPABASE_URL).protocol !== 'https:') {
    throw new Error('SUPABASE_URL must use HTTPS in production');
  }
  if (config.NODE_ENV === 'production' && config.DISCORD_TRANSFER_WEBHOOK && new URL(config.DISCORD_TRANSFER_WEBHOOK).protocol !== 'https:') {
    throw new Error('DISCORD_TRANSFER_WEBHOOK must use HTTPS in production');
  }
  if (config.NODE_ENV === 'production') {
    for (const name of ['DATABASE_URL', 'AUTH_DATABASE_URL'] as const) {
      const url = new URL(config[name]);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.searchParams.get('sslmode') !== 'verify-full') {
        throw new Error(`${name} must use PostgreSQL with sslmode=verify-full in production`);
      }
    }
  }
  return config;
}

export type Config = ReturnType<typeof readConfig>;
