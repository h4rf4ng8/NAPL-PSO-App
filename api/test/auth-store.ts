import type { AuthStore } from '../plugins/session/store.js';

// Unit fixtures only; production always uses PostgreSQL shared state.
export function authStore(overrides: Partial<AuthStore> = {}): AuthStore {
  return { admit: async () => ({ status: 'allowed', retryAfter: 0 }), ...overrides };
}
