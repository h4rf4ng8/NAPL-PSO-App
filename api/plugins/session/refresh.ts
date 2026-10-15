import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { setTimeout as setTimeoutGlobal } from 'node:timers';
import { z } from 'zod';
import type { DiscordAuth } from '../discord/client.js';
import { GatewayError } from '../auth/errors.js';
import type { MembershipStore } from '../membership/store.js';
import { hashKey } from '../limits/auth.js';
import type { AuthStore } from './store.js';
import type { SupabaseAuth } from '../supabase/client.js';
import { CookieCrypto } from './crypto.js';
import { sessionSchema, type Session } from './model.js';

const resultSchema = z.object({
  accessToken: z.string(),
  session: sessionSchema,
  authCookie: z.string(),
  error: z.object({ status: z.union([z.literal(401), z.literal(403), z.literal(429), z.literal(503)]), code: z.string(), retryAfter: z.number().optional() }).optional(),
});
export type RefreshResult = z.infer<typeof resultSchema>;

export class SessionRefresher {
  constructor(
    private readonly store: AuthStore,
    private readonly crypto: CookieCrypto,
    private readonly supabase: SupabaseAuth,
    private readonly discord: DiscordAuth,
    private readonly membership: MembershipStore,
  ) {}

  async refresh(session: Session, accessToken: string | undefined, ip: string): Promise<RefreshResult> {
    const cacheKey = hashKey(`${session.sessionId}:${session.supabaseRefresh}:${session.discordRefresh}:${session.accessExpiresAt}`);
    const owner = randomUUID();
    const deadline = Date.now() + 10_000;
    let delay = 100;
    while (Date.now() < deadline) {
      const cached = await this.store.readRefresh(cacheKey);
      if (cached) return await this.crypto.open('refresh-result', cached, resultSchema);
      // Leave ten seconds of the 45-second database lease for publication and release.
      const leaseDeadline = Date.now() + 35_000;
      if (await this.store.claimRefresh(session.sessionId, owner)) {
        try {
          const afterLock = await this.store.readRefresh(cacheKey);
          if (afterLock) return await this.crypto.open('refresh-result', afterLock, resultSchema);
          const result = await this.rotate(session, accessToken, ip, leaseDeadline);
          try {
            const published = await this.store.publishRefresh(session.sessionId, owner, cacheKey, await this.crypto.seal('refresh-result', result));
            if (!published) throw new Error('Refresh lease expired');
          } catch {
            result.error = { status: 503, code: 'refresh_cache_unavailable', retryAfter: 1 };
          }
          return result;
        } finally {
          try {
            // A timed-out provider call may still finish its own bounded abort. Keep
            // the lease until expiry so another instance cannot rotate underneath it.
            if (Date.now() < leaseDeadline) await this.store.releaseRefresh(session.sessionId, owner);
          } catch {
            // An unavailable database leaves the lease to expire; preserve rotated tokens.
          }
        }
      }
      await setTimeout(Math.min(delay + Math.random() * 50, Math.max(0, deadline - Date.now())));
      delay = Math.min(delay * 2, 500);
    }
    throw new GatewayError(503, 'refresh_busy', 1);
  }

  private async rotate(original: Session, incomingAccess: string | undefined, ip: string, leaseDeadline: number): Promise<RefreshResult> {
    const session = { ...original };
    let accessToken = incomingAccess ?? '';
    let tokenValid = false;
    if (accessToken && session.accessExpiresAt > Date.now() / 1000 + 30) {
      try {
        const identity = await beforeDeadline(leaseDeadline, () => this.supabase.verify(accessToken));
        tokenValid = identity.userId === session.userId && identity.sessionId === session.sessionId;
      } catch (error) {
        if (!(error instanceof GatewayError) || error.status !== 401) throw error;
      }
    }
    if (!tokenValid) {
      const tokens = await beforeDeadline(leaseDeadline, () => this.supabase.refresh(session.supabaseRefresh, ip));
      const identity = await beforeDeadline(leaseDeadline, () => this.supabase.verify(tokens.access_token));
      if (identity.userId !== session.userId || identity.sessionId !== session.sessionId) throw new GatewayError(401, 'session_identity_mismatch');
      accessToken = tokens.access_token;
      session.supabaseRefresh = tokens.refresh_token;
      session.accessExpiresAt = identity.expiresAt;
    }
    let failure: RefreshResult['error'];
    try {
      let eligible = await beforeDeadline(leaseDeadline, () => this.membership.fresh(session.userId));
      if (eligible === null) {
        if (session.discordExpiresAt !== null && session.discordExpiresAt <= Date.now() / 1000 + 30) await this.refreshDiscord(session, leaseDeadline);
        try {
          eligible = await beforeDeadline(leaseDeadline, () => this.discord.membership(session.discordAccess, session.discordUserId));
        } catch (error) {
          if (!(error instanceof GatewayError) || error.code !== 'discord_consent_required') throw error;
          await this.refreshDiscord(session, leaseDeadline);
          eligible = await beforeDeadline(leaseDeadline, () => this.discord.membership(session.discordAccess, session.discordUserId));
        }
        await beforeDeadline(leaseDeadline, () => this.membership.save(session.userId, session.discordUserId, eligible!));
      }
      if (!eligible) throw new GatewayError(403, 'discord_membership_required');
    } catch (error) {
      const known = error instanceof GatewayError && error.status !== 400 ? error : new GatewayError(503, 'membership_unavailable', 1);
      failure = { status: known.status as 401 | 403 | 429 | 503, code: known.code, retryAfter: known.retryAfter };
    }
    session.expiresAt = Math.floor(Date.now() / 1000) + 30 * 86_400;
    return { accessToken, session, authCookie: await this.crypto.seal('session', session), ...(failure && { error: failure }) };
  }

  private async refreshDiscord(session: Session, leaseDeadline: number): Promise<void> {
    const tokens = await beforeDeadline(leaseDeadline, () => this.discord.refresh(session.discordRefresh));
    session.discordAccess = tokens.access_token;
    session.discordRefresh = tokens.refresh_token;
    session.discordExpiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
}

async function beforeDeadline<T>(deadline: number, work: () => Promise<T>): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new GatewayError(503, 'refresh_busy', 1);
  // Provider HTTP calls have independent four-second aborts. This also bounds DB waits.
  let timer: ReturnType<typeof setTimeoutGlobal> | undefined;
  try {
    return await Promise.race([work(), new Promise<never>((_resolve, reject) => {
      timer = setTimeoutGlobal(() => reject(new GatewayError(503, 'refresh_busy', 1)), remaining);
    })]);
  } finally { clearTimeout(timer); }
}
