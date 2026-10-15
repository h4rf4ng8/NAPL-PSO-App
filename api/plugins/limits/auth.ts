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

  async endpoint(endpoint: 'login' | 'callback' | 'refresh' | 'logout' | 'csrf', ip: string, userId?: string, sessionId?: string): Promise<void> {
    const minute = 60_000;
    const settings = {
      login: { ip: 20, window: 10 * minute, global: 120 },
      callback: { ip: 60, window: 10 * minute, global: 240 },
      refresh: { ip: 600, window: 5 * minute, global: 1000 },
      logout: { ip: 120, window: minute, global: 1000 },
      csrf: { ip: 120, window: minute, global: 1000 },
    }[endpoint];
    const limits: Limit[] = [
      { key: `${endpoint}:global`, count: settings.global, windowMs: minute },
      { key: `${endpoint}:ip:${normalizeIp(ip)}`, count: settings.ip, windowMs: settings.window },
    ];
    if (userId && endpoint === 'refresh') limits.push({ key: `refresh:user:${userId}`, count: 30, windowMs: 5 * minute });
    if (sessionId && endpoint === 'refresh') limits.push({ key: `refresh:session:${sessionId}`, count: 12, windowMs: 5 * minute });
    await this.admit(limits);
  }
}
