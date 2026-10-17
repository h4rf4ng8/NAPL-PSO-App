import { readConfig } from '../../plugins/cfg.js';
import type { Session } from '../../plugins/session/model.js';

export const userId = 'fef79a51-49a9-45c9-a2a5-99d7b601e497';
export const sessionId = '34b955f8-47f8-482b-b513-b02eeb8a0b3d';
export const keys = JSON.stringify({ current: Buffer.alloc(32, 42).toString('base64') });
export const config = readConfig({
  NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://localhost:8080', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
  SUPABASE_PUBLISHABLE_KEY: 'public', DISCORD_CLIENT_ID: '123', DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_GUILD_ID: '456', DATABASE_URL: 'postgres://localhost/test',
  COOKIE_KEYS: keys, ORIGIN_SECRET: 'test-origin-secret-000000000000000000000000',
});
export function session(): Session {
  return {
    userId, sessionId, discordUserId: '123456789', supabaseRefresh: 'supabase-secret',
    discordAccess: 'discord-access-secret', discordRefresh: 'discord-refresh-secret',
    discordExpiresAt: null, accessExpiresAt: Math.floor(Date.now() / 1000) - 1,
    expiresAt: Math.floor(Date.now() / 1000) + 86_400,
  };
}
