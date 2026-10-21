import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RateLimiter } from '../../plugins/limits/auth.js';
import { GatewayError } from '../../plugins/auth/errors.js';

test('provision admission hashes global, normalized IP, account and session quotas', async () => {
  const calls: unknown[] = [];
  const limiter = new RateLimiter({ admit: async limits => { calls.push(limits); return { status: 'allowed', retryAfter: 0 }; } });
  await limiter.provision('::ffff:192.0.2.1', 'private-user-id', 'private-session-id');
  await limiter.provision('192.0.2.1', 'private-user-id', 'private-session-id');
  assert.deepEqual(calls[0], calls[1]);
  const limits = calls[0] as Array<{ key: string; count: number; windowMs: number }>;
  assert.equal(limits.length, 4); assert.equal(new Set(limits.map(limit => limit.key)).size, 4);
  for (const limit of limits) assert.match(limit.key, /^[a-f\d]{64}$/);
});

test('admission limit, capacity and database failures have bounded safe errors', async () => {
  for (const [status, httpStatus, code, retry] of [['limited', 429, 'rate_limited', 7], ['capacity', 503, 'rate_limit_capacity', 1]] as const) {
    const limiter = new RateLimiter({ admit: async () => ({ status, retryAfter: 7 }) });
    await assert.rejects(limiter.provision('192.0.2.1', 'user', 'session'), error => error instanceof GatewayError && error.status === httpStatus && error.code === code && error.retryAfter === retry);
  }
  const limiter = new RateLimiter({ admit: async () => { throw new Error('private database detail'); } });
  await assert.rejects(limiter.provision('192.0.2.1', 'user', 'session'), error => error instanceof GatewayError && error.code === 'rate_limit_unavailable' && error.retryAfter === 1);
});
