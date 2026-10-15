import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { test } from 'node:test';
import { createProxyHandler, memoizeAwsCredentials } from '../server/proxy.js';

const env = {
  API_URL: 'https://example.lambda-url.us-west-2.on.aws',
  AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/proxy',
  AWS_REGION: 'us-west-2',
  ORIGIN_SECRET: 'a-test-origin-secret-that-is-long-enough',
};
const credentials = async () => ({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'example-secret', sessionToken: 'example-token' });

class TestResponse extends Writable {
  statusCode = 200;
  headersSent = false;
  headers = new Map<string, string | string[]>();
  body = Buffer.alloc(0);
  setHeader(name: string, value: string | number | readonly string[]) { this.headers.set(name.toLowerCase(), value as string | string[]); return this; }
  getHeader(name: string) { return this.headers.get(name.toLowerCase()); }
  flushHeaders() { this.headersSent = true; }
  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) { this.headersSent = true; this.body = Buffer.concat([this.body, chunk]); callback(); }
}

async function invoke(options: { url: string; method?: string; headers?: Record<string, string>; body?: string; fetch?: typeof fetch; deadlineMs?: number; signingDate?: Date; hangBody?: boolean; disconnectMs?: number; credentials?: () => Promise<Awaited<ReturnType<typeof credentials>>> }) {
  let seen: { url: string; init?: RequestInit } | undefined;
  const handler = createProxyHandler({ env, credentials: options.credentials ?? credentials, deadlineMs: options.deadlineMs, signingDate: () => options.signingDate ?? new Date('2020-01-01T00:00:00Z'), fetch: options.fetch ?? (async (input, init) => {
    seen = { url: String(input), init };
    return new Response('ok', { status: 201, headers: { 'content-type': 'text/plain' } });
  }) });
  const request = options.hangBody ? new Readable({ read() {} }) : Readable.from(options.body === undefined ? [] : [Buffer.from(options.body)]);
  Object.assign(request, {
    url: options.url, method: options.method ?? 'GET',
    headers: { 'x-vercel-forwarded-for': '203.0.113.4', ...options.headers },
  });
  const response = new TestResponse();
  if (options.disconnectMs !== undefined) setTimeout(() => response.emit('close'), options.disconnectMs);
  await handler(request as IncomingMessage, response as unknown as ServerResponse);
  return { response, seen };
}

test('signs the fixed Lambda URL while preserving raw path, duplicate query, body and cookies', async () => {
  const { response, seen } = await invoke({
    url: '/api/votes/%E2%9C%93?tag=one&tag=two&empty=&comma=a%2Cb&literal=a,b&plus=a+b&space=a%20b', method: 'POST', signingDate: new Date('2020-01-01T00:00:00Z'),
    headers: { cookie: `session=abc; payload=${'x'.repeat(7600)}`, authorization: 'Bearer spoof', 'x-amz-date': 'spoof', 'x-real-ip': 'spoof', 'x-origin-secret': 'spoof', 'x-user-id': 'spoof', 'x-session-id': 'spoof', 'x-user-role': 'admin', 'x-apigateway-event': 'spoof', 'x-apigateway-context': 'spoof', 'content-type': 'application/octet-stream' },
    body: 'raw\0bytes',
  });
  assert.equal(response.statusCode, 201);
  assert.equal(seen?.url, 'https://example.lambda-url.us-west-2.on.aws/api/votes/%E2%9C%93?tag=one&tag=two&empty=&comma=a%2Cb&literal=a,b&plus=a+b&space=a%20b');
  assert.deepEqual(seen?.init?.body, Buffer.from('raw\0bytes'));
  const headers = new Headers(seen?.init?.headers);
  assert.match(headers.get('authorization') ?? '', /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
  assert.match(headers.get('authorization') ?? '', /SignedHeaders=[^,]*x-origin-secret/);
  assert.equal(headers.get('x-amz-security-token'), 'example-token');
  assert.equal(headers.get('x-amz-content-sha256'), createHash('sha256').update(Buffer.from('raw\0bytes')).digest('hex'));
  assert.match(headers.get('authorization') ?? '', /x-amz-content-sha256/);
  assert.match(headers.get('authorization') ?? '', /SignedHeaders=[^,]*host/);
  assert.equal(headers.get('host'), 'example.lambda-url.us-west-2.on.aws');
  assert.equal(headers.get('authorization')?.split('Signature=', 2)[1], 'bc595e4c42e3ef4dd3de24c1ff765c9a30d1111c5e8f98a93a7bd24043fd5117');
  assert.equal(headers.get('cookie'), `session=abc; payload=${'x'.repeat(7600)}`);
  assert.equal(headers.get('x-user-id'), null);
  assert.equal(headers.get('x-session-id'), null);
  assert.equal(headers.get('x-user-role'), null);
  assert.equal(headers.get('x-apigateway-event'), null);
  assert.equal(headers.get('x-apigateway-context'), null);
  assert.equal(headers.get('x-real-ip'), '203.0.113.4');
  assert.equal(headers.get('x-origin-secret'), env.ORIGIN_SECRET);
  assert.equal(response.getHeader('cache-control'), 'no-store');
});

const cookieResponseFetch: typeof fetch = async () => {
  const headers = new Headers();
  headers.append('set-cookie', 'session=one; HttpOnly');
  headers.append('set-cookie', 'csrf=two; SameSite=Lax');
  return new Response(null, { status: 204, headers });
};

test('forwards multiple Set-Cookie values only for auth responses', async () => {
  const fetcher = cookieResponseFetch;
  const auth = await invoke({ url: '/auth/callback', fetch: fetcher });
  assert.deepEqual(auth.response.getHeader('set-cookie'), ['session=one; HttpOnly', 'csrf=two; SameSite=Lax']);
  const api = await invoke({ url: '/api/votes', fetch: fetcher });
  assert.equal(api.response.getHeader('set-cookie'), undefined);
});

test('rejects unsupported routes, path tricks, bad IPs and oversized bodies before fetch', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response('ok'); };
  for (const url of ['/assets/app.js', '/api//evil', '/api/%2e%2e/auth']) {
    const { response } = await invoke({ url, fetch: fetcher });
    assert.ok(response.statusCode === 404 || response.statusCode === 400);
  }
  const invalidIp = await invoke({ url: '/api/votes', headers: { 'x-vercel-forwarded-for': '203.0.113.4, 198.51.100.1' }, fetch: fetcher });
  assert.equal(invalidIp.response.statusCode, 400);
  const large = await invoke({ url: '/auth/session', method: 'POST', headers: { 'content-length': String(16 * 1024 + 1) }, fetch: fetcher });
  assert.equal(large.response.statusCode, 413);
  const largeApi = await invoke({ url: '/api/upload', method: 'POST', headers: { 'content-length': String(2_000_001) }, fetch: fetcher });
  assert.equal(largeApi.response.statusCode, 413);
  assert.equal(calls, 0);
});

test('does not retry an upstream failure', async () => {
  let calls = 0;
  const fail: typeof fetch = async () => { calls++; throw new Error('offline'); };
  const { response } = await invoke({ url: '/api/votes', fetch: fail });
  assert.equal(response.statusCode, 502);
  assert.equal(calls, 1);
});

const pendingFetch: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
});

test('passes expired-auth and transient statuses through without retrying', async () => {
  for (const status of [403, 429, 503]) {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      return new Response('upstream error', { status, headers: { 'retry-after': '7', location: '/auth/login' } });
    };
    const { response } = await invoke({ url: '/api/votes', fetch: fetcher });
    assert.equal(response.statusCode, status);
    assert.equal(response.getHeader('retry-after'), '7');
    assert.equal(response.getHeader('location'), '/auth/login');
    assert.equal(response.body.toString(), 'upstream error');
    assert.equal(calls, 1);
  }
});

test('bounds a hanging body read and never starts an upstream request after timeout', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response('ok'); };
  const body = await invoke({ url: '/api/votes', method: 'POST', hangBody: true, fetch: fetcher, deadlineMs: 5 });
  assert.equal(body.response.statusCode, 504);
  assert.equal(calls, 0);
});

const neverCredentials = () => new Promise<Awaited<ReturnType<typeof credentials>>>(() => {});

test('bounds credential acquisition before any network request', async () => {
  let calls = 0;
  const timed = await invoke({ url: '/api/votes', fetch: async () => { calls++; return new Response('ok'); }, deadlineMs: 5, credentials: neverCredentials });
  assert.equal(timed.response.statusCode, 504);
  assert.equal(calls, 0);
});

test('aborts an upstream request at the configured deadline', async () => {
  const { response } = await invoke({ url: '/api/votes', fetch: pendingFetch, deadlineMs: 5 });
  assert.equal(response.statusCode, 504);
});

test('cancels upstream work when the client disconnects', async () => {
  const { response } = await invoke({ url: '/api/votes', fetch: pendingFetch, disconnectMs: 5 });
  assert.equal(response.destroyed, true);
});

test('deduplicates concurrent credential fetches and refreshes before expiry', async () => {
  let now = 1000;
  let calls = 0;
  const cached = memoizeAwsCredentials(async () => {
    calls++;
    return { accessKeyId: `key-${calls}`, secretAccessKey: 'secret', expiration: new Date(now + 120_000) };
  }, () => now);
  const first = await Promise.all(Array.from({ length: 8 }, () => cached()));
  assert.equal(calls, 1);
  assert.ok(first.every(value => value === first[0]));
  assert.equal((await cached()).accessKeyId, 'key-1');
  now += 60_001;
  const refreshed = await Promise.all(Array.from({ length: 8 }, () => cached()));
  assert.equal(calls, 2);
  assert.ok(refreshed.every(value => value.accessKeyId === 'key-2'));
});

test('failed credential refresh rejects all waiters and recovers without stale credentials', async () => {
  const now = 1000;
  let calls = 0;
  const cached = memoizeAwsCredentials(async () => {
    calls++;
    if (calls === 1) return { accessKeyId: 'old-key', secretAccessKey: 'old-secret', expiration: new Date(now + 30_000) };
    if (calls === 2) throw new Error('STS unavailable');
    return { accessKeyId: 'new-key', secretAccessKey: 'new-secret', expiration: new Date(now + 120_000) };
  }, () => now);
  assert.equal((await cached()).accessKeyId, 'old-key');
  const failed = await Promise.allSettled(Array.from({ length: 8 }, () => cached()));
  assert.equal(calls, 2);
  assert.ok(failed.every(result => result.status === 'rejected'));
  assert.equal((await cached()).accessKeyId, 'new-key');
  assert.equal((await cached()).accessKeyId, 'new-key');
  assert.equal(calls, 3);
});
