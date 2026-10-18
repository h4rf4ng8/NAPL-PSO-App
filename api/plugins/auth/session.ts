import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/cookie';
import { z } from 'zod';
import type { Config } from '../cfg.js';
import type { DiscordAuth } from '../discord/client.js';
import { GatewayError } from './errors.js';
import type { MembershipStore } from '../membership/store.js';
import { hashKey, normalizeIp, RateLimiter } from '../limits/auth.js';
import type { AuthStore } from '../session/store.js';
import { CookieCrypto } from '../session/crypto.js';
import { sessionSchema, transactionSchema, type Session, type Identity } from '../session/model.js';
import { SessionRefresher } from '../session/refresh.js';
import type { SupabaseAuth } from '../supabase/client.js';

export interface SessionDependencies {
  authStore: AuthStore;
  supabase: SupabaseAuth;
  discord: DiscordAuth;
  membership: MembershipStore;
  provision(accessToken: string): Promise<void>;
}
export function cookieNames(secure: boolean) {
  return {
    access: secure ? '__Host-napl-access' : 'napl-access',
    auth: secure ? '__Secure-napl-auth' : 'napl-auth',
    csrf: secure ? '__Host-napl-csrf' : 'napl-csrf',
    transaction: secure ? '__Secure-napl-login' : 'napl-login',
  };
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function clientIp(request: FastifyRequest): string {
  const ip = header(request, 'x-real-ip');
  if (!ip) throw new GatewayError(400, 'missing_client_ip');
  normalizeIp(ip);
  return ip;
}

export function createSession(config: Config, deps: SessionDependencies) {
  const secure = config.NODE_ENV !== 'development' && config.NODE_ENV !== 'test';
  const names = cookieNames(secure);
  const crypto = new CookieCrypto(config.COOKIE_KEYS);
  const limiter = new RateLimiter(deps.authStore);
  const refresher = new SessionRefresher(deps.authStore, crypto, deps.supabase, deps.discord, deps.membership);
  const baseCookie = { secure, sameSite: 'lax' as const, httpOnly: true as const };
  const readSession = async (request: FastifyRequest): Promise<Session> => {
    const session = await crypto.open('session', request.cookies[names.auth], sessionSchema);
    if (session.expiresAt <= Date.now() / 1000) throw new GatewayError(401, 'login_required');
    return session;
  };
  const csrfCookie = (reply: FastifyReply, sessionId: string): string => {
    const token = crypto.csrf(sessionId);
    reply.setCookie(names.csrf, token, { ...baseCookie, path: '/', httpOnly: false, maxAge: 3600 });
    return token;
  };
  const checkCsrf = (request: FastifyRequest, sessionId: string): void => {
    if (header(request, 'origin') !== config.PUBLIC_ORIGIN || (
      request.routeOptions.config.csrf !== 'apollo' && !crypto.verifyCsrf(header(request, 'x-csrf-token'), request.cookies[names.csrf], sessionId)
    )) {
      throw new GatewayError(403, 'csrf_invalid');
    }
  };
  const binding = async (request: FastifyRequest): Promise<string> => {
    try {
      const authCookie = request.cookies[names.auth];
      if (authCookie) {
        const session = await readSession(request);
        return session.sessionId;
      }
      const access = request.cookies[names.access];
      if (!access) return 'anonymous';
      const identity = await deps.supabase.verify(access);
      return identity.sessionId;
    } catch (error) {
      if (error instanceof GatewayError && error.status === 401) return 'anonymous';
      throw error;
    }
  };
  const sessionCookies = async (reply: FastifyReply, session: Session, accessToken: string, sealed?: string): Promise<void> => {
    if (accessToken.length > 3700) throw new GatewayError(503, 'access_cookie_too_large');
    const authCookie = sealed ?? await crypto.seal('session', session);
    reply.setCookie(names.access, accessToken, { ...baseCookie, path: '/', maxAge: 30 * 86_400 });
    reply.setCookie(names.auth, authCookie, { ...baseCookie, path: '/auth', maxAge: 30 * 86_400 });
    csrfCookie(reply, session.sessionId);
  };
  const clearCookies = (reply: FastifyReply): void => {
    reply.clearCookie(names.access, { ...baseCookie, path: '/' });
    reply.clearCookie(names.auth, { ...baseCookie, path: '/auth' });
    reply.clearCookie(names.csrf, { ...baseCookie, path: '/', httpOnly: false });
    reply.clearCookie(names.transaction, { ...baseCookie, path: '/auth' });
  };

  async function checkApi(request: FastifyRequest): Promise<Identity | null> {
    clientIp(request);
    const accessToken = request.cookies[names.access];
    const identity: Identity | null = accessToken ? await deps.supabase.verify(accessToken) : null;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) checkCsrf(request, identity?.sessionId ?? 'anonymous');
    return identity;
  }

  function registerRoutes(app: FastifyInstance): void {
    app.get('/auth/csrf', async (request, reply) => {
      await limiter.endpoint('csrf', clientIp(request));
      return { csrfToken: csrfCookie(reply, await binding(request)) };
    });

    app.post('/auth/login/discord', async (request, reply) => {
      await limiter.endpoint('login', clientIp(request));
      checkCsrf(request, await binding(request));
      const transaction = { id: randomBytes(32).toString('base64url'), verifier: randomBytes(32).toString('base64url'), expiresAt: Math.floor(Date.now() / 1000) + 600 };
      reply.setCookie(names.transaction, await crypto.seal('login', transaction), { ...baseCookie, path: '/auth', maxAge: 600 });
      const challenge = createHash('sha256').update(transaction.verifier).digest('base64url');
      return { url: deps.supabase.loginUrl(challenge, transaction.id) };
    });

    app.get('/auth/callback', async (request, reply) => {
      const ip = clientIp(request);
      await limiter.endpoint('callback', ip);
      const query = z.object({ code: z.string().min(1).max(4096), transaction: z.string().min(32).max(128) }).safeParse(request.query);
      const transaction = await crypto.open('login', request.cookies[names.transaction], transactionSchema);
      reply.clearCookie(names.transaction, { ...baseCookie, path: '/auth' });
      if (!query.success || query.data.transaction !== transaction.id || transaction.expiresAt <= Date.now() / 1000) throw new GatewayError(401, 'login_transaction_invalid');
      const consumed = await deps.authStore.consumeLogin(hashKey(transaction.id));
      if (!consumed) throw new GatewayError(401, 'login_transaction_used');
      const tokens = await deps.supabase.exchange(query.data.code, transaction.verifier, ip);
      const identity = await deps.supabase.verify(tokens.access_token);
      await limiter.admit([{ key: `callback:user:${identity.userId}`, count: 10, windowMs: 600_000 }]);
      if (!tokens.provider_token || !tokens.provider_refresh_token) throw new GatewayError(401, 'discord_consent_required');
      const discordId = await deps.discord.identity(tokens.provider_token);
      const provider = tokens.user?.identities?.find(item => item.provider === 'discord')?.identity_data;
      const providerId = provider?.sub ?? provider?.provider_id;
      if (providerId !== discordId || tokens.user?.id !== identity.userId) throw new GatewayError(401, 'discord_identity_mismatch');
      const eligible = await deps.discord.membership(tokens.provider_token, discordId);
      await deps.membership.save(identity.userId, discordId, eligible);
      if (!eligible) throw new GatewayError(403, 'discord_membership_required');
      const session: Session = {
        userId: identity.userId,
        sessionId: identity.sessionId,
        supabaseRefresh: tokens.refresh_token,
        discordUserId: discordId,
        discordAccess: tokens.provider_token,
        discordRefresh: tokens.provider_refresh_token,
        discordExpiresAt: null,
        accessExpiresAt: identity.expiresAt,
        expiresAt: Math.floor(Date.now() / 1000) + 30 * 86_400,
      };
      await deps.provision(tokens.access_token);
      await sessionCookies(reply, session, tokens.access_token);
      return reply.redirect(`${config.PUBLIC_ORIGIN}/`);
    });

    app.post('/auth/refresh', async (request, reply) => {
      const session = await readSession(request);
      checkCsrf(request, session.sessionId);
      const ip = clientIp(request);
      await limiter.endpoint('refresh', ip, session.userId, session.sessionId);
      const result = await refresher.refresh(session, request.cookies[names.access], ip);
      await sessionCookies(reply, result.session, result.accessToken, result.authCookie);
      if (result.error) throw new GatewayError(result.error.status, result.error.code, result.error.retryAfter);
      return { ok: true };
    });

    app.post('/auth/logout', async (request, reply) => {
      if (header(request, 'origin') !== config.PUBLIC_ORIGIN || !crypto.verifyLogoutCsrf(header(request, 'x-csrf-token'), request.cookies[names.csrf])) {
        throw new GatewayError(403, 'csrf_invalid');
      }
      clearCookies(reply);
      const access = request.cookies[names.access];
      const authCookie = request.cookies[names.auth];
      let upstreamRevoked = !access && !authCookie;
      try {
        if (access || authCookie) {
          const ip = clientIp(request);
          await limiter.endpoint('logout', ip);
          const session = authCookie ? await readSession(request) : undefined;
          const identity = session ?? (access ? await deps.supabase.verify(access) : undefined);
          if (!identity) throw new GatewayError(401, 'login_required');
          await limiter.admit([{ key: `logout:session:${identity.sessionId}`, count: 10, windowMs: 60_000 }]);
          let logoutAccess = access;
          if (session && (!access || session.accessExpiresAt <= Date.now() / 1000)) {
            const refreshed = await refresher.refresh(session, access, ip);
            logoutAccess = refreshed.accessToken;
          }
          if (!logoutAccess) throw new GatewayError(401, 'login_required');
          await deps.supabase.logout(logoutAccess, ip);
          upstreamRevoked = true;
        }
      } catch {
        upstreamRevoked = false;
      }
      return reply.code(200).send({ ok: true, upstreamRevoked });
    });
  }

  return { checkApi, registerRoutes };
}
