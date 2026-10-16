import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Dependencies } from '../app.js';
import type { Config } from './cfg.js';
import { requireMember, requireActiveSession, type Identity as ApiIdentity } from './auth/identity.js';
import type { SessionDependencies } from './auth/session.js';
import { DiscordClient } from './discord/client.js';
import { connectDatabase } from './db/client.js';
import { PostgresAuthStore } from './session/pg-store.js';
import { PostgresMembershipStore } from './membership/store.js';
import { provisionAccount } from '../routes/accounts/provision.js';
import { SupabaseClient } from './supabase/client.js';

export function createRuntime(config: Config): Dependencies {
  const db = connectDatabase(config.DATABASE_URL);
  const authClient = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: config.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
    }),
  });
  const authStore = new PostgresAuthStore(authClient);
  const supabase = new SupabaseClient(config);
  const discord = new DiscordClient(config);
  const membership = new PostgresMembershipStore(authClient);
  const session: SessionDependencies = {
    authStore,
    supabase,
    discord,
    membership,
    provision: async accessToken => {
      const verified = await supabase.verify(accessToken);
      const identity: ApiIdentity = { id: verified.userId, sessionId: verified.sessionId, claims: verified.claims ?? {} };
      await requireMember(db, identity.id);
      await requireActiveSession(db, identity.sessionId);
      await provisionAccount(db, identity);
    },
  };

  return {
    db,
    config,
    session,
    webhookUrl: config.DISCORD_TRANSFER_WEBHOOK,
    async close() {
      await Promise.allSettled([db.close(), authClient.$disconnect()]);
    },
  };
}
