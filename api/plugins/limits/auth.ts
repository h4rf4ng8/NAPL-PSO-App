import { createHash } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { GatewayError } from '../auth/errors.js';
import type { AuthStore, AuthLimit } from '../session/store.js';

export type Limit = AuthLimit;

export function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeIp(value: string): string {
  try {
    const address = ipaddr.process(value);
    if (address.kind() === 'ipv4') return address.toString();
    const bytes = address.toByteArray();
    return `${Buffer.from(bytes.slice(0, 8)).toString('hex')}::/64`;
  } catch {
    throw new GatewayError(400, 'invalid_client_ip');
  }
}

export class RateLimiter {
  constructor(private readonly store: AuthStore) {}

  async admit(limits: Limit[]): Promise<void> {
    try {
      const result = await this.store.admit(limits.map(limit => ({ ...limit, key: hashKey(limit.key) })));
      if (result.status === 'limited') throw new GatewayError(429, 'rate_limited', result.retryAfter);
      if (result.status === 'capacity') throw new GatewayError(503, 'rate_limit_capacity', 1);
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(503, 'rate_limit_unavailable', 1);
    }
  }

  async provision(ip: string, userId: string, sessionId: string): Promise<void> {
    await this.admit([
      { key: 'provision:global', count: 120, windowMs: 60_000 },
      { key: `provision:ip:${normalizeIp(ip)}`, count: 20, windowMs: 600_000 },
      { key: `provision:user:${userId}`, count: 10, windowMs: 600_000 },
      { key: `provision:session:${sessionId}`, count: 10, windowMs: 600_000 },
    ]);
  }
}
