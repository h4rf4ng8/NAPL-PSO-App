import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/cookie';
import type { Config } from '../cfg.js';
import type { DiscordAuth } from '../discord/client.js';
import { GatewayError } from './errors.js';
import type { MembershipStore } from '../membership/store.js';
import { normalizeIp, RateLimiter } from '../limits/auth.js';
import type { AuthStore } from '../session/store.js';
import { CookieCrypto } from '../session/crypto.js';
import { sessionSchema, type Session, type Identity } from '../session/model.js';
import { SessionRefresher } from '../session/refresh.js';
import type { SupabaseAuth } from '../supabase/client.js';
import { registerAuthRoutes } from '../../routes/auth/index.js';

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

export interface SessionContext {
  config: Config;
  deps: SessionDependencies;
  names: ReturnType<typeof cookieNames>;
  crypto: CookieCrypto;
  limiter: RateLimiter;
  refresher: SessionRefresher;
  baseCookie: { secure: boolean; sameSite: 'lax'; httpOnly: true };
  header(request: FastifyRequest, name: string): string | undefined;
  clientIp(request: FastifyRequest): string;
  readSession(request: FastifyRequest): Promise<Session>;
  binding(request: FastifyRequest): Promise<string>;
  checkCsrf(request: FastifyRequest, sessionId: string): void;
  csrfCookie(reply: FastifyReply, sessionId: string): string;
  sessionCookies(reply: FastifyReply, session: Session, accessToken: string, sealed?: string): Promise<void>;
  clearCookies(reply: FastifyReply): void;
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
  const clientIp = (request: FastifyRequest): string => {
    const ip = header(request, 'x-real-ip');
    if (!ip) throw new GatewayError(400, 'missing_client_ip');
    normalizeIp(ip);
    return ip;
  };
  const csrfCookie = (reply: FastifyReply, sessionId: string): string => {
    const token = crypto.csrf(sessionId);
    reply.setCookie(names.csrf, token, { ...baseCookie, path: '/', httpOnly: false, maxAge: 3600 });
    return token;
  };
  const checkCsrf = (request: FastifyRequest, sessionId: string): void => {
    if (header(request, 'origin') !== config.PUBLIC_ORIGIN || !crypto.verifyCsrf(header(request, 'x-csrf-token'), request.cookies[names.csrf], sessionId)) {
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
  const context: SessionContext = {
    config, deps, names, crypto, limiter, refresher, baseCookie,
    header, clientIp, readSession, binding, checkCsrf, csrfCookie, sessionCookies, clearCookies,
  };

  async function checkApi(request: FastifyRequest): Promise<Identity | null> {
    clientIp(request);
    const accessToken = request.cookies[names.access];
    const identity: Identity | null = accessToken ? await deps.supabase.verify(accessToken) : null;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) checkCsrf(request, identity?.sessionId ?? 'anonymous');
    return identity;
  }

  return {
    checkApi,
    registerRoutes(app: FastifyInstance) { registerAuthRoutes(app, context); },
  };
}
