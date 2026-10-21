import type { Dependencies } from '../app.js';
import type { Config } from './cfg.js';
import { DiscordClient } from './discord/client.js';
import { connectDatabase } from './db/client.js';
import { PostgresAuthStore } from './session/pg-store.js';
import { SupabaseClient } from './supabase/client.js';

export function createRuntime(config: Config): Dependencies {
  const db = connectDatabase(config.DATABASE_URL);
  return {
    db, config,
    auth: { authStore: new PostgresAuthStore(db), supabase: new SupabaseClient(config), discord: new DiscordClient() },
    webhookUrl: config.DISCORD_TRANSFER_WEBHOOK,
    close: () => db.close(),
  };
}
