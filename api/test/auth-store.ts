import type { AuthStore } from '../plugins/session/store.js';

// Unit fixtures only; production always uses PostgreSQL shared state.
export function authStore(overrides: Partial<AuthStore> = {}): AuthStore {
  const replay = new Set<string>();
  const leases = new Map<string, string>();
  const results = new Map<string, string>();
  return {
    consumeLogin: async key => { if (replay.has(key)) return false; replay.add(key); return true; },
    readRefresh: async key => results.get(key) ?? null,
    claimRefresh: async (key, owner) => { if (leases.has(key)) return false; leases.set(key, owner); return true; },
    publishRefresh: async (key, owner, resultKey, sealed) => {
      if (leases.get(key) !== owner) return false;
      results.set(resultKey, sealed);
      return true;
    },
    releaseRefresh: async (key, owner) => { if (leases.get(key) === owner) leases.delete(key); },
    admit: async () => ({ status: 'allowed', retryAfter: 0 }),
    ...overrides,
  };
}
