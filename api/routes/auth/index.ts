import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GatewayError } from '../../plugins/auth/errors.js';
import { hashKey } from '../../plugins/limits/auth.js';
import { transactionSchema, type Session } from '../../plugins/session/model.js';
import type { SessionContext } from '../../plugins/auth/session.js';

export function registerAuthRoutes(app: FastifyInstance, ctx: SessionContext): void {
  const { config, deps, names, crypto, limiter, refresher, baseCookie } = ctx;

  app.get('/auth/csrf', async (request, reply) => {
    await limiter.endpoint('csrf', ctx.clientIp(request));
    return { csrfToken: ctx.csrfCookie(reply, await ctx.binding(request)) };
  });

  app.post('/auth/login/discord', async (request, reply) => {
    await limiter.endpoint('login', ctx.clientIp(request));
    ctx.checkCsrf(request, await ctx.binding(request));
    const transaction = { id: randomBytes(32).toString('base64url'), verifier: randomBytes(32).toString('base64url'), expiresAt: Math.floor(Date.now() / 1000) + 600 };
    reply.setCookie(names.transaction, await crypto.seal('login', transaction), { ...baseCookie, path: '/auth', maxAge: 600 });
    const challenge = createHash('sha256').update(transaction.verifier).digest('base64url');
    return { url: deps.supabase.loginUrl(challenge, transaction.id) };
  });

  app.get('/auth/callback', async (request, reply) => {
    const ip = ctx.clientIp(request);
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
    await ctx.sessionCookies(reply, session, tokens.access_token);
    return reply.redirect(`${config.PUBLIC_ORIGIN}/`);
  });

  app.post('/auth/refresh', async (request, reply) => {
    const session = await ctx.readSession(request);
    ctx.checkCsrf(request, session.sessionId);
    const ip = ctx.clientIp(request);
    await limiter.endpoint('refresh', ip, session.userId, session.sessionId);
    const result = await refresher.refresh(session, request.cookies[names.access], ip);
    await ctx.sessionCookies(reply, result.session, result.accessToken, result.authCookie);
    if (result.error) throw new GatewayError(result.error.status, result.error.code, result.error.retryAfter);
    return { ok: true };
  });

  app.post('/auth/logout', async (request, reply) => {
    if (ctx.header(request, 'origin') !== config.PUBLIC_ORIGIN || !crypto.verifyLogoutCsrf(ctx.header(request, 'x-csrf-token'), request.cookies[names.csrf])) {
      throw new GatewayError(403, 'csrf_invalid');
    }
    ctx.clearCookies(reply);
    const access = request.cookies[names.access];
    const authCookie = request.cookies[names.auth];
    let upstreamRevoked = !access && !authCookie;
    try {
      if (access || authCookie) {
        const ip = ctx.clientIp(request);
        await limiter.endpoint('logout', ip);
        const session = authCookie ? await ctx.readSession(request) : undefined;
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
