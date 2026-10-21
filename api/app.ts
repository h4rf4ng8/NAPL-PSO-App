import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { Database, Row } from './plugins/db/client.js';
import { object, string } from './plugins/db/records.js';
import { HttpError, type Identity, actor, isAdmin, roles } from './plugins/auth/identity.js';
import { registerAccounts } from './routes/accounts/routes.js';
import { registerTeams } from './routes/teams/routes.js';
import { registerContent } from './routes/content/routes.js';
import { registerMatches } from './routes/matches/routes.js';
import { registerVoting } from './routes/voting/routes.js';
import { registerAdmin } from './routes/admin/routes.js';
import { registerSettings } from './routes/settings/routes.js';
import { registerGraphQL } from './routes/graphql/index.js';
import cors from '@fastify/cors';
import fp from 'fastify-plugin';
import type { SupabaseAuth } from './plugins/supabase/client.js';
import type { DiscordAuth } from './plugins/discord/client.js';
import type { AuthStore } from './plugins/session/store.js';
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
    }
}
export interface Dependencies {
    db: Database;
    config: Config;
    auth: { supabase: SupabaseAuth; discord: DiscordAuth; authStore: AuthStore };
    close?: () => Promise<void>;
    webhookUrl?: string;
}
export function createApp(dependencies: Dependencies): FastifyInstance {
    const app = Fastify({
        bodyLimit: 2_000_000, requestTimeout: 20_000,
        logger: dependencies.config.NODE_ENV === 'test' ? false : {
            serializers: { req: request => ({ method: request.method }), res: reply => ({ statusCode: reply.statusCode }) },
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.providerToken', 'res.headers.set-cookie'],
        },
    });
    app.decorateRequest('identity', null);
    app.decorateRequest('userRoles');
    app.addHook('onSend', async (_request, reply, payload) => {
        reply.header('cache-control', 'no-store');
        reply.header('x-content-type-options', 'nosniff');
        reply.removeHeader('set-cookie');
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
        if (sqlState === '23503' || ['P2003', '23503'].includes(problem.code ?? ''))
            return reply.code(409).send({
                error: 'reference_conflict', message: 'A related record is missing or still references this record'
            });
        if (sqlState === '23514' || problem.code === '23514')
            return reply.code(400).send({
                error: 'invalid_data', message: 'The values violate a database constraint'
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
        await scope.register(cors, {
            origin: (origin, done) => {
                if (origin !== undefined && origin !== dependencies.config.PUBLIC_ORIGIN) return done(new HttpError(403, 'origin_forbidden'), false);
                done(null, origin === dependencies.config.PUBLIC_ORIGIN);
            },
            methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Authorization', 'Content-Type', 'Apollo-Require-Preflight', 'Idempotency-Key'],
            exposedHeaders: ['Retry-After'],
            credentials: false,
        });
        scope.addHook('onRequest', async request => {
            request.userRoles = [];
            if (!request.url.split('?', 1)[0]?.startsWith('/api/')) return;
            const authorization = request.headers.authorization;
            if (authorization !== undefined) {
                const bearer = /^Bearer ([^\s,]+)$/i.exec(authorization);
                if (!bearer) throw new GatewayError(401, 'access_invalid');
                request.identity = await dependencies.auth.supabase.verify(bearer[1]!);
            }
            // Forwarded headers and cookies never establish identity or limiter addresses.
            for (const header of Object.keys(request.headers)) {
                if (header.startsWith('x-forwarded-') || ['cookie', 'x-user-id', 'x-session-id', 'x-user-role', 'x-origin-secret', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'true-client-ip', 'x-client-ip', 'x-apigateway-event', 'x-apigateway-context'].includes(header)) delete request.headers[header];
            }
            const policy = request.routeOptions.config;
            if (!policy.public) {
                actor(request);
            }
            if (request.identity) request.userRoles = await roles(dependencies.db, request.identity.id);
            if (policy.role && (policy.role === 'super_admin' ? !request.userRoles.includes('super_admin') : !isAdmin(request))) {
                throw new HttpError(403, 'admin_required');
            }
        });
        registerAccounts(scope, dependencies);
        registerTeams(scope, dependencies);
        registerContent(scope, dependencies);
        registerMatches(scope, dependencies);
        registerVoting(scope, dependencies);
        registerAdmin(scope, dependencies);
        registerSettings(scope, dependencies);
        await registerGraphQL(scope, dependencies.db);
    }, { name: 'api-routes' }));
    if (dependencies.close) app.addHook('onClose', dependencies.close);
    return app;
}
