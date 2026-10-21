import { readConfig } from '../../plugins/cfg.js';

export const userId = 'fef79a51-49a9-45c9-a2a5-99d7b601e497';
export const sessionId = '34b955f8-47f8-482b-b513-b02eeb8a0b3d';
export const config = readConfig({
  NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://localhost:8080', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
  SUPABASE_PUBLISHABLE_KEY: 'public', DATABASE_URL: 'postgres://localhost/test',
});
