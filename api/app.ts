import { diagnose, invocation, loggerOptions, requestId } from './plugins/logging.js';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
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
import { registerMedia } from './routes/payload/media.js';
import { graphqlEndpoints } from '@napl/contracts';
import { registerDetails } from './routes/payload/details.js';
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
        logController: new LogController({ disableRequestLogging: true, requestIdLogLabel: 'request_id' }),
        requestIdHeader: false,
        genReqId: requestId,
        logger: dependencies.config.NODE_ENV === 'test' ? false : loggerOptions(dependencies.config),
    });
    app.decorateRequest('diagnostic', null);
    app.addHook('onRequest', (request, _reply, done) => {
        invocation.run({ ...invocation.getStore(), requestId: request.id, request }, done);
    });
    app.addHook('onResponse', async (request, reply) => {
        const diagnostic = request.diagnostic;
        request.log[diagnostic?.level ?? (reply.statusCode >= 500 ? 'error' : 'info')]({
            event: 'api.request.completed', method: request.method,
            route: request.routeOptions.url ?? 'unmatched', status: reply.statusCode,
            ...(!request.routeOptions.url && { code: 'not_found' }),
            duration_ms: Math.round(reply.elapsedTime),
            ...(request.identity && { actor_id: request.identity.id }),
            ...(invocation.getStore()?.version && { version: invocation.getStore()!.version }),
            ...(diagnostic && { ...diagnostic, level: undefined }),
        });
        const current = invocation.getStore();
        if (!current) return;
        current.completed = true;
        delete current.request;
    });
    app.decorateRequest('identity', null);
    app.decorateRequest('userRoles');
    const fixedReads = new Set<string>(Object.values(graphqlEndpoints));
    app.addHook('preSerialization', async (request, reply, payload) => {
        const route = request.routeOptions.url ?? '';
        const writesRecord = /^\/api\/(accounts|users\/me|teams|news|rules|articles|schedule|transfers|submissions|import-match|voting|settings|roles|position-requests)(\/|$)/.test(route);
        if (!writesRecord || fixedReads.has(route) || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return payload;
        if (reply.statusCode === 204 || reply.statusCode < 200 || reply.statusCode >= 300) return payload;
        if (payload === null || typeof payload !== 'object' || Buffer.isBuffer(payload)) return payload;
        const result = object(payload);
        // Imports return bounded counts and input indexes needed for the result screen.
        if (route === '/api/import-match') return payload;
        return result.ok === false ? payload : { ok: true, ...(typeof result.id === 'string' && { id: result.id }) };
    });
    app.addHook('onSend', async (request, reply, payload) => {
        reply.header('x-request-id', request.id);
        reply.header('cache-control', 'no-store');
        reply.header('x-content-type-options', 'nosniff');
        reply.removeHeader('set-cookie');
        return payload;
    });
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof GatewayError) {
            diagnose(request, error, error.code, error.status >= 500 ? 'error' : 'info');
            if (error.retryAfter !== undefined) reply.header('retry-after', error.retryAfter);
            return reply.code(error.status).send({ error: { code: error.code } });
        }
        if (error instanceof HttpError) {
            diagnose(request, error, error.code, error.status >= 500 ? 'error' : 'info');
            if (error.retryAfter !== undefined) reply.header('retry-after', error.retryAfter);
            return reply.code(error.status).send({
                error: error.code, message: error.message
            });
        }
        if (error instanceof ZodError) {
            diagnose(request, error, 'invalid_request', 'info');
            return reply.code(400).send({
                error: 'invalid_request', message: 'Request validation failed'
            });
        }
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
        if (typeof problem.statusCode === 'number' && problem.statusCode >= 400 && problem.statusCode < 500) {
            diagnose(request, error, 'invalid_request', 'info');
            return reply.code(problem.statusCode).send({
                error: 'invalid_request', message: 'Request rejected'
            });
        }
        if (sqlState === '23505' || ['P2002', '23505'].includes(problem.code ?? '')) {
            diagnose(request, error, 'conflict', 'info');
            return reply.code(409).send({
                error: 'conflict', message: 'This value is already in use'
            });
        }
        if (sqlState === '23503' || ['P2003', '23503'].includes(problem.code ?? '')) {
            diagnose(request, error, 'reference_conflict', 'info');
            return reply.code(409).send({
                error: 'reference_conflict', message: 'A related record is missing or still references this record'
            });
        }
        if (sqlState === '23514' || problem.code === '23514') {
            diagnose(request, error, 'invalid_data', 'info');
            return reply.code(400).send({
                error: 'invalid_data', message: 'The values violate a database constraint'
            });
        }
        if (problem.code === 'P2034' || adapterCause.kind==='TransactionWriteConflict' || ['40001','40P01'].includes(sqlState)) {
            diagnose(request, error, 'concurrent_update', 'info');
            return reply.code(409).send({
                error: 'concurrent_update', message: 'Another request changed this record; reload and try again'
            });
        }
        diagnose(request, error, 'service_unavailable');
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
            exposedHeaders: ['Retry-After', 'X-Request-Id'],
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
        registerMedia(scope, dependencies.db);
        registerDetails(scope, dependencies.db);
        await registerGraphQL(scope, dependencies.db);
    }, { name: 'api-routes' }));
    if (dependencies.close) app.addHook('onClose', dependencies.close);
    return app;
}
