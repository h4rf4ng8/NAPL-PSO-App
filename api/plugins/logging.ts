import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { writeSync } from 'node:fs';
import type { FastifyRequest } from 'fastify';
import { GatewayError } from './auth/errors.js';
import { object, string } from './db/records.js';
import type { Config } from './cfg.js';

export const invocation = new AsyncLocalStorage<{ requestId: string; version?: string; request?: FastifyRequest; completed?: boolean }>();
export const requestId = () => invocation.getStore()?.requestId ?? randomUUID();
type Diagnostic = { level: 'info' | 'warn' | 'error'; code: string; upstream?: GatewayError['upstream']; error_type?: string; source?: string; db_code?: string; sqlstate?: string; team_id?: string };
declare module 'fastify' {
  interface FastifyRequest { diagnostic: Diagnostic | null; resource: { type: 'account' | 'team' | 'position_request' | 'news' | 'rule' | 'article' | 'schedule' | 'transfer' | 'submission' | 'voting_period'; id: string } | null; }
}

// Only classifications and source locations are safe; messages, causes and SQL contain user data.
export function errorFields(error: unknown) {
  const problem = error as { name?: string; message?: string; code?: string; stack?: string } | null;
  const errorType = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ZodError', 'DriverAdapterError', 'PrismaClientKnownRequestError'].includes(problem?.name ?? '') ? problem!.name : 'Error';
  const heading = `${problem?.name}: ${problem?.message}`;
  const frames = problem?.stack?.startsWith(heading) ? problem.stack.slice(heading.length) : undefined;
  const source = frames?.split('\n').filter(line => /^\s+at /.test(line)).join('\n').match(/(?:api\/[\w./-]+\.[cm]?[jt]s|lambda\.js):\d+:\d+/)?.[0];
  const meta = object(object(error).meta);
  const cause = object(problem?.name === 'DriverAdapterError' ? object(error).cause : object(meta.driverAdapterError).cause);
  const rawCode = string(problem?.code);
  const dbCode = /^P[1-9]\d{3}$/.test(rawCode) ? rawCode : '';
  const pgClasses = ['00','01','02','03','08','09','0A','0B','0F','0L','0P','0Z','10','20','21','22','23','24','25','26','27','28','2B','2D','2F','34','38','39','3B','3D','3F','40','42','44','53','54','55','57','58','72','F0','HV','P0','XX'];
  const nativePg = error instanceof Error && error.constructor.name === 'DatabaseError';
  const sqlstate = string(cause.originalCode) || string(meta.code) || (!dbCode && (nativePg || pgClasses.includes(rawCode.slice(0,2))) ? rawCode : '');
  return {
    error_type: errorType,
    ...(source && { source }),
    ...(dbCode && { db_code: dbCode }),
    ...(/^[0-9A-Z]{5}$/.test(sqlstate) && { sqlstate }),
  };
}

export function diagnose(request: FastifyRequest, error: unknown, code: string, level: Diagnostic['level'] = 'error'): void {
  const priority = { info: 0, warn: 1, error: 2 };
  if (request.diagnostic && priority[request.diagnostic.level] >= priority[level]) return;
  const fields = errorFields(error);
  request.diagnostic = {
    level, code,
    ...(fields.db_code && { db_code: fields.db_code }),
    ...(fields.sqlstate && { sqlstate: fields.sqlstate }),
    ...(error instanceof GatewayError && error.upstream && { upstream: error.upstream }),
    ...(level !== 'info' && { error_type: fields.error_type, ...(fields.source && { source: fields.source }) }),
  };
}

export function renderLocal(line: string): string {
  const { timestamp, level, component, event, ...fields } = JSON.parse(line) as Record<string, unknown>;
  return `${timestamp} ${level} ${component} ${event} ${Object.entries(fields).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(' ')}\n`;
}

export function loggerOptions(config: Pick<Config, 'NODE_ENV' | 'LOG_LEVEL'>, write = (line: string) => { writeSync(1, line); }) {
  return {
    level: config.LOG_LEVEL,
    base: { component: 'api' },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    hooks: { logMethod(this: unknown, args: unknown[], method: (this: unknown, ...args: unknown[]) => void, level: number) {
      if (typeof args[0] === 'object' && args[0] !== null && 'event' in args[0]) {
        method.apply(this, args);
        return;
      }
      if (level < 40) return; // Listen prose is replaced by api.server.ready.
      const message = typeof args[0] === 'string' ? args[0] : string(args[1]);
      const code = [
        ['Reply was already sent', 'reply_already_sent'],
        ['stream payload does not end properly', 'stream_incomplete'],
        ['Promise errored, but reply.sent', 'late_handler_rejection'],
        ['onRequestAborted hook failed', 'abort_hook_failed'],
      ].find(([prefix]) => message.startsWith(prefix!))?.[1] ?? 'framework_failure';
      const error = object(args[0]).err ?? args[0];
      const current = invocation.getStore();
      if (current?.request && !current.completed) {
        diagnose(current.request, error, code, level >= 50 ? 'error' : 'warn');
      } else {
        const bindings = (this as { bindings(): Record<string, unknown> }).bindings();
        method.call(this, { event: 'api.framework.diagnostic', code, ...errorFields(error),
          ...(current && !bindings.request_id && { request_id: current.requestId }),
          ...(current?.version && { version: current.version }),
        });
      }
    } },
    formatters: { level: (level: string) => ({ level: level.toUpperCase() }) },
    stream: { write(line: string) {
      // A broken logging sink must not replace the request's business outcome.
      try { write(config.NODE_ENV === 'development' ? renderLocal(line) : line); } catch { /* No recursive logging. */ }
    } },
  };
}
