import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

type Credentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string; expiration?: Date };
export function memoizeAwsCredentials(provider: () => Promise<Credentials>, now = Date.now): () => Promise<Credentials> {
  let cached: Credentials | undefined;
  let inflight: Promise<Credentials> | undefined;
  const refresh = async () => {
    try {
      const value = await provider();
      cached = value.expiration ? value : undefined;
      return value;
    } finally {
      inflight = undefined;
    }
  };
  return async () => {
    if (cached?.expiration && cached.expiration.getTime() > now() + 60_000) return cached;
    if (!inflight) inflight = refresh();
    return inflight;
  };
}

type Dependencies = {
  env: NodeJS.ProcessEnv;
  credentials?: () => Promise<Credentials>;
  fetch: typeof globalThis.fetch;
  deadlineMs?: number;
  signingDate?: () => Date;
};

const MAX_API_BODY = 2_000_000;
const MAX_AUTH_BODY = 16 * 1024;
const DEADLINE_MS = 55_000;
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length']);
const SPOOFED_HEADERS = new Set([
  'authorization', 'proxy-authorization', 'x-amz-date', 'x-amz-security-token', 'x-amz-content-sha256',
  'x-amz-user-agent', 'x-real-ip', 'x-origin-secret', 'x-forwarded-for', 'x-forwarded-host',
  'x-forwarded-proto', 'forwarded', 'x-client-ip', 'true-client-ip', 'cf-connecting-ip', 'x-cluster-client-ip',
  'x-forwarded-client-cert', 'x-original-forwarded-for', 'x-original-url', 'x-rewrite-url', 'x-remote-user',
  'x-vercel-forwarded-for', 'x-vercel-id', 'x-vercel-proxy-signature',
  'x-user-id', 'x-user-role', 'x-session-id', 'x-apigateway-event', 'x-apigateway-context',
  'x-vercel-proxy-signature-ts', 'x-vercel-sc-headers', 'x-vercel-sc-basepath',
]);

function configuration(env: NodeJS.ProcessEnv) {
  const raw = env.API_URL;
  const role = env.AWS_ROLE_ARN;
  const region = env.AWS_REGION;
  const secret = env.ORIGIN_SECRET;
  if (!raw || !role || !region || !secret || secret.length < 32) throw new Error('Proxy configuration is incomplete');
  let target: URL;
  try { target = new URL(raw); } catch { throw new Error('API_URL must be a Lambda Function URL'); }
  if (!/^https:\/\/[a-z0-9.-]+\/?$/i.test(raw) || target.protocol !== 'https:' || target.pathname !== '/' || !/^[a-z0-9-]+\.lambda-url\.[a-z0-9-]+\.on\.aws$/i.test(target.hostname)) throw new Error('API_URL must be an HTTPS Lambda Function URL host');
  const arn = /^arn:aws:iam::\d{12}:role\/.+$/.exec(role);
  if (!arn || !/^[a-z0-9-]+$/.test(region) || !target.hostname.endsWith(`.lambda-url.${region}.on.aws`)) throw new Error('AWS role or region is invalid');
  return { target, region, secret };
}

function safePathAndQuery(rawUrl: string): { path: string; auth: boolean } | undefined {
  const question = rawUrl.indexOf('?');
  const path = question === -1 ? rawUrl : rawUrl.slice(0, question);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('//') || rawUrl.includes('#') || path.includes('\\') || /%(?:2f|5c)/i.test(path)) return undefined;
  const segments = path.split('/');
  if (segments.some(segment => {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { return true; }
    return decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\');
  })) return undefined;
  const auth = path === '/auth' || path.startsWith('/auth/');
  if (!auth && path !== '/api' && !path.startsWith('/api/')) return undefined;
  return { path: path + (question === -1 ? '' : rawUrl.slice(question)), auth };
}

function singleClientIp(request: IncomingMessage): string | undefined {
  const value = request.headers['x-vercel-forwarded-for'];
  if (typeof value !== 'string' || value.includes(',')) return undefined;
  const ip = value.trim();
  return isIP(ip) ? ip : undefined;
}

function parseRawQuery(raw: string): Record<string, string | string[]> {
  const values = new Map<string, string[]>();
  const parameters = new URLSearchParams(raw);
  for (const [key, value] of parameters) {
    const entries = values.get(key);
    if (entries) entries.push(value);
    else values.set(key, [value]);
  }
  return Object.fromEntries([...values].map(([key, entries]) => [key, entries.length === 1 ? entries[0]! : entries]));
}

function requestHeaders(request: IncomingMessage, clientIp: string, secret: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const connectionHeaders = new Set((request.headers.connection ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
  for (const [key, value] of Object.entries(request.headers)) {
    if (key === 'accept-encoding' || !value || HOP_HEADERS.has(key) || connectionHeaders.has(key) || SPOOFED_HEADERS.has(key) || key.startsWith('x-amz-') || key.startsWith('x-amzn-') || key.startsWith('x-forwarded-') || key.startsWith('x-vercel-')) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  headers['accept-encoding'] = 'identity';
  headers['x-real-ip'] = clientIp;
  headers['x-origin-secret'] = secret;
  return headers;
}

async function readBody(request: IncomingMessage, limit: number): Promise<Uint8Array | undefined> {
  const length = request.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > limit)) throw new RangeError('Request body too large');
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > limit) throw new RangeError('Request body too large');
    chunks.push(bytes);
  }
  return size ? Buffer.concat(chunks, size) : undefined;
}

function appendResponseHeaders(response: ServerResponse, headers: Headers, auth: boolean): void {
  const connection = headers.get('connection')?.split(',').map(value => value.trim().toLowerCase()) ?? [];
  const blocked = new Set([...HOP_HEADERS, ...connection]);
  for (const [key, value] of headers) {
    if (blocked.has(key.toLowerCase()) || key.toLowerCase() === 'set-cookie') continue;
    response.setHeader(key, value);
  }
  const cookies = headers.getSetCookie?.() ?? [];
  if (auth && cookies.length > 0) response.setHeader('set-cookie', cookies);
}

async function sha256Hex(body: Uint8Array | undefined): Promise<string> {
  const hash = new Sha256();
  if (body) hash.update(body);
  const digest = await hash.digest();
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

function sendError(response: ServerResponse, status: number, code: string): void {
  if (response.headersSent) { response.destroy(); return; }
  response.statusCode = status;
  response.setHeader('cache-control', 'no-store');
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ error: { code } }));
}

export function createProxyHandler(deps: Dependencies) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    response.setHeader('cache-control', 'no-store');
    const abort = new AbortController();
    let abortReason: 'deadline' | 'disconnect' | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      abort.signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true });
    });
    const cancel = (reason: 'deadline' | 'disconnect') => {
      if (abort.signal.aborted) return;
      abortReason = reason;
      abort.abort();
    };
    const timer = setTimeout(() => cancel('deadline'), deps.deadlineMs ?? DEADLINE_MS);
    const onRequestAbort = () => cancel('disconnect');
    const onRequestError = (error: Error) => { if (error.message === 'aborted') cancel('disconnect'); };
    const onResponseClose = () => { if (!response.writableEnded) cancel('disconnect'); };
    request.once('aborted', onRequestAbort);
    request.once('error', onRequestError);
    response.once('close', onResponseClose);
    const withinDeadline = <T>(promise: Promise<T>) => Promise.race([promise, aborted]);
    try {
      let config: ReturnType<typeof configuration>;
      try { config = configuration(deps.env); }
      catch { sendError(response, 503, 'proxy_unavailable'); return; }
      const route = safePathAndQuery(request.url ?? '');
      if (!route) { sendError(response, 404, 'not_found'); return; }
      const clientIp = singleClientIp(request);
      if (!clientIp) { sendError(response, 400, 'invalid_client_ip'); return; }
      if (!deps.credentials) { sendError(response, 503, 'proxy_unavailable'); return; }

      let body: Uint8Array | undefined;
      try { body = await withinDeadline(readBody(request, route.auth ? MAX_AUTH_BODY : MAX_API_BODY)); }
      catch (error) {
        if (abortReason) throw error;
        sendError(response, error instanceof RangeError ? 413 : 400, error instanceof RangeError ? 'body_too_large' : 'invalid_request');
        return;
      }

      const raw = route.path;
      const pathOnly = raw.split('?', 1)[0]!;
      const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
      const headers = requestHeaders(request, clientIp, config.secret);
      headers.host = config.target.host;
      headers['x-amz-content-sha256'] = await withinDeadline(sha256Hex(body));
      const signingRequest = new HttpRequest({
        protocol: 'https:', hostname: config.target.hostname, method: request.method ?? 'GET',
        path: pathOnly, query: query ? parseRawQuery(query) : {}, headers, body,
      });
      const credentials = await withinDeadline(deps.credentials());
      const signer = new SignatureV4({ credentials, region: config.region, service: 'lambda', sha256: Sha256 });
      const signed = await withinDeadline(signer.sign(signingRequest, { signingDate: deps.signingDate?.() }));
      if (abort.signal.aborted) throw new Error('request aborted');
      const signedHeaders = new Headers();
      for (const [key, value] of Object.entries(signed.headers)) signedHeaders.set(key, value);
      const targetUrl = `https://${config.target.host}${raw}`;
      const upstream = await withinDeadline(deps.fetch(targetUrl, {
        method: request.method,
        headers: signedHeaders,
        body: body as BodyInit | undefined,
        redirect: 'manual',
        cache: 'no-store',
        signal: abort.signal,
      }));
      const encoding = upstream.headers.get('content-encoding');
      if (encoding && encoding.toLowerCase() !== 'identity') {
        await upstream.body?.cancel();
        sendError(response, 502, 'invalid_upstream_encoding');
        return;
      }
      response.statusCode = upstream.status;
      appendResponseHeaders(response, upstream.headers, route.auth);
      response.setHeader('cache-control', 'no-store');
      if (request.method === 'HEAD' || upstream.status === 204 || upstream.status === 304 || !upstream.body) { response.end(); return; }
      response.flushHeaders();
      await withinDeadline(pipeline(Readable.fromWeb(upstream.body as never), response));
    } catch {
      if (abortReason === 'deadline') sendError(response, 504, 'upstream_timeout');
      else if (abortReason === 'disconnect') response.destroy();
      else sendError(response, 502, 'upstream_unavailable');
    } finally {
      clearTimeout(timer);
      request.removeListener('aborted', onRequestAbort);
      request.removeListener('error', onRequestError);
      response.removeListener('close', onResponseClose);
    }
  };
}
