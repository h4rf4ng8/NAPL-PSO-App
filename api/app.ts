import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { Database, Row } from './plugins/db/client.js';
import { object, string } from './plugins/db/records.js';
import { HttpError, type Identity, actor, isAdmin, requireMember, requireActiveSession, roles } from './plugins/auth/identity.js';
import { registerAccounts } from './routes/accounts/index.js';
import { registerTeams } from './routes/teams/index.js';
import { registerContent } from './routes/content/index.js';
import { registerMatches } from './routes/matches/index.js';
import { registerVoting } from './routes/voting/index.js';
import { registerAdmin } from './routes/admin/index.js';
import { registerSettings } from './routes/settings/index.js';
import { registerGraphQL } from './routes/graphql/index.js';
import cookie from '@fastify/cookie';
import fp from 'fastify-plugin';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createSession, type SessionDependencies } from './plugins/auth/session.js';
import { GatewayError } from './plugins/auth/errors.js';
import type { Config } from './plugins/cfg.js';
declare module 'fastify' {
    interface FastifyRequest {
        identity: Identity | null;
        userRoles: ('admin' | 'super_admin')[];
    }
    interface FastifyContextConfig {
        public?: boolean;
        role?: 'admin' | 'super_admin';
        membership?: boolean;
    }
}
export interface Dependencies {
    db: Database;
    config: Config;
    session: SessionDependencies;
    close?: () => Promise<void>;
    webhookUrl?: string;
}
export function createApp(dependencies: Dependencies): FastifyInstance {
    const app = Fastify({
        bodyLimit: 2_000_000, requestTimeout: 20_000,
        logger: dependencies.config.NODE_ENV === 'test' ? false : {
            // Never log raw URLs: OAuth callback URLs contain one-time credentials.
            serializers: { req: request => ({ method: request.method }), res: reply => ({ statusCode: reply.statusCode }) },
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-origin-secret', 'res.headers.set-cookie'],
        },
    });
    const secret = dependencies.config.ORIGIN_SECRET;
    if (!secret || secret.length < 32) throw new Error('ORIGIN_SECRET must contain at least 32 characters');
    const expected = createHash('sha256').update(secret).digest();
    app.addHook('onRoute', options => {
        if (options.url.startsWith('/auth/')) options.bodyLimit = 16 * 1024;
    });
    app.decorateRequest('identity', null);
    app.decorateRequest('userRoles');
    app.addHook('onRequest', async request => {
        const supplied = request.headers['x-origin-secret'];
        if (typeof supplied !== 'string' || !timingSafeEqual(expected, createHash('sha256').update(supplied).digest())) {
            throw new HttpError(403, 'origin_forbidden');
        }
        // Identity comes exclusively from the verified HttpOnly session cookie.
        delete request.headers.authorization;
        delete request.headers['x-user-id'];
        delete request.headers['x-session-id'];
        delete request.headers['x-user-role'];
    });
    app.addHook('onSend', async (request, reply, payload) => {
        reply.header('cache-control', 'no-store');
        reply.header('x-vercel-enable-rewrite-caching', '0');
        reply.header('x-content-type-options', 'nosniff');
        if (!request.routeOptions.url?.startsWith('/auth/')) reply.removeHeader('set-cookie');
        return payload;
    });
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof GatewayError) {
            if (error.retryAfter !== undefined) reply.header('retry-after', error.retryAfter);
            return reply.code(error.status).send({ error: { code: error.code } });
        }
        if (error instanceof HttpError) {
            if (error.retryAfter !== undefined) reply.header('retry-after', error.retryAfter);
            return reply.code(error.status).send({
                error: error.code, message: error.message
            });
        }
        if (error instanceof ZodError)
            return reply.code(400).send({
                error: 'invalid_request', message: 'Request validation failed', issues: error.issues.map(index => ({
                    path: index.path, message: index.message
                }))
            });
        const problem = error as {
            name?: string;
            cause?: Row;
            code?: string;
            meta?: Row;
            statusCode?: number;
        };
        // Commit failures can expose the adapter error directly rather than inside P2010.
        const adapterCause=object(problem.name === 'DriverAdapterError' ? problem.cause : object(problem.meta?.driverAdapterError).cause);
        const sqlState=string(adapterCause.originalCode)||string(problem.meta?.code);
        if (typeof problem.statusCode === 'number' && problem.statusCode >= 400 && problem.statusCode < 500)
            return reply.code(problem.statusCode).send({
                error: 'invalid_request', message: 'Request rejected'
            });
        if (sqlState === '23505' || ['P2002', '23505'].includes(problem.code ?? ''))
            return reply.code(409).send({
                error: 'conflict', message: 'This value is already in use'
            });
        if (problem.code === 'P2034' || adapterCause.kind==='TransactionWriteConflict' || ['40001','40P01'].includes(sqlState))
            return reply.code(409).send({
                error: 'concurrent_update', message: 'Another request changed this record; reload and try again'
            });
        request.log.error({
            code: problem.code ?? 'unknown'
        }, 'Request failed');
        reply.header('retry-after', 1);
        return reply.code(503).send({
            error: 'service_unavailable', message: 'Service temporarily unavailable'
        });
    });
    app.register(fp(async scope => {
        await scope.register(cookie);
        const session = createSession(dependencies.config, dependencies.session);
        scope.addHook('onRequest', async request => {
            request.userRoles = [];
            if (!request.url.split('?', 1)[0]?.startsWith('/api/')) return;
            const verified = await session.checkApi(request);
            request.identity = verified ? { id: verified.userId, sessionId: verified.sessionId, claims: verified.claims ?? {} } : null;
            const policy = request.routeOptions.config;
            if (!policy.public) {
                const identity = actor(request);
                if (policy.membership !== false) await requireMember(dependencies.db, identity.id);
            }
            if (request.identity) request.userRoles = await roles(dependencies.db, request.identity.id);
            if (policy.role && (policy.role === 'super_admin' ? !request.userRoles.includes('super_admin') : !isAdmin(request))) {
                throw new HttpError(403, 'admin_required');
            }
            if (request.identity && (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) || isAdmin(request))) {
                await requireActiveSession(dependencies.db, request.identity.sessionId);
            }
        });
        session.registerRoutes(scope);
        registerAccounts(scope, dependencies);
        registerTeams(scope, dependencies);
        registerContent(scope, dependencies);
        registerMatches(scope, dependencies);
        registerVoting(scope, dependencies);
        registerAdmin(scope, dependencies);
        registerSettings(scope, dependencies);
        registerGraphQL(scope, dependencies.db);
    }, { name: 'api-routes' }));
    if (dependencies.close) app.addHook('onClose', dependencies.close);
    return app;
}
