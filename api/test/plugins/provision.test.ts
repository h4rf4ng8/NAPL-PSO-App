import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp, type Dependencies } from '../../app.js';
import { type Database, type Row, Prisma } from '../../plugins/db/client.js';
import type { SupabaseUser } from '../../plugins/supabase/client.js';
import { GatewayError } from '../../plugins/auth/errors.js';
import { config, userId, sessionId } from './fixtures.js';

const otherId = '11111111-1111-4111-8111-111111111111';
const baseAccount = { id: userId, username: 'old_handle', position: 'CM', team_id: null, stats: {}, matches: [], awards: [], championships: [], created_at: new Date(0), season_stats: {} };
function harness(options: { existing?: boolean; providerUser?: SupabaseUser; limited?: boolean; conflict?: boolean } = {}) {
  let account: Row | null = options.existing ? { ...baseAccount } : null;
  const counts = { profile: 0, user: 0, created: 0, updated: 0, transactions: 0, admissions: 0 };
  const limits: unknown[] = [];
  const db: Database = {
    client: {
      account: {
        findUnique: async ({ where }: { where: { id?: string; username_lower?: string } }) => {
          if (where.id) return account;
          if (options.conflict) return { ...baseAccount, id: otherId, username: 'verified_handle' };
          return account?.username === where.username_lower ? account : null;
        },
        create: async ({ data }: { data: Row }) => { counts.created++; account = { ...baseAccount, ...data }; return account; },
        updateManyAndReturn: async ({ data }: { data: Row }) => { counts.updated++; account = { ...account, ...data }; return [account]; },
      },
      setting: { findUnique: async () => null }, submission: { findMany: async () => [] },
    } as unknown as Prisma.TransactionClient,
    query: async <T extends Row>(sql: Prisma.Sql) => {
      if (sql.sql.includes('SELECT * FROM asl.accounts')) return (account ? [account] : []) as T[];
      if (sql.sql.includes('AS season_stats')) return (account ? [account] : []) as T[];
      if (sql.sql.includes('memberships')) throw new Error('Guild membership must not be consulted');
      return [] as T[];
    },
    execute: async () => 1,
    transaction: async work => { counts.transactions++; return work(db); }, close: async () => {},
  };
  const auth: Dependencies['auth'] = {
    authStore: { admit: async input => { counts.admissions++; limits.push(...input); return { status: options.limited ? 'limited' : 'allowed', retryAfter: 9 }; } },
    supabase: {
      verify: async token => {
        if (token === 'expired') throw new GatewayError(401, 'access_expired');
        return { id: userId, sessionId, claims: { user_metadata: { username: 'forged', provider_id: '123' } } };
      },
      user: async token => { assert.equal(token, 'good'); counts.user++; return options.providerUser ?? { id: userId, identities: [{ provider: 'discord', id: '123' }] }; },
    },
    discord: { identity: async token => { assert.equal(token, 'provider'); counts.profile++; return { id: '123', username: 'verified_handle' }; } },
  };
  const app = createApp({ db, config, auth });
  const call = (body: unknown = {}, token = 'good') => app.inject({ method: 'POST', url: '/api/users/me', headers: { authorization: `Bearer ${token}`, 'x-real-ip': 'not-an-ip' }, payload: body as object });
  return { app, call, counts, limits, account: () => account };
}

test('new provision uses verified Discord handle, admits without guild membership and returns account roles', async () => {
  const h = harness();
  try {
    const response = await h.call({ providerToken: 'provider' });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { ok: true, id: userId });
    assert.equal(h.account()?.username, 'verified_handle');
    const current = await h.app.inject({ url: '/api/users/me', headers: { authorization: 'Bearer good' } });
    assert.equal(current.statusCode, 200, current.body);
    assert.equal(current.json().username, 'verified_handle');
    assert.deepEqual(current.json().roles, []);
    assert.deepEqual(h.counts, { profile: 1, user: 1, created: 1, updated: 0, transactions: 1, admissions: 1 });
    assert.equal(h.limits.length, 4);
    for (const limit of h.limits as Array<{ key: string }>) assert.match(limit.key, /^[a-f\d]{64}$/);
  } finally { await h.app.close(); }
});

test('empty body works for existing accounts; new accounts require provider proof', async () => {
  for (const existing of [true, false]) {
    const h = harness({ existing });
    try {
      const response = await h.call();
      assert.equal(response.statusCode, existing ? 200 : 409, response.body);
      if (!existing) assert.equal(response.json().error, 'discord_profile_required');
      assert.equal(h.counts.profile, 0); assert.equal(h.counts.user, 0); assert.equal(h.counts.created, 0);
    } finally { await h.app.close(); }
  }
});

test('provision synchronizes verified handle and preserves username conflicts', async () => {
  for (const conflict of [false, true]) {
    const h = harness({ existing: true, conflict });
    try {
      const response = await h.call({ providerToken: 'provider' });
      assert.equal(response.statusCode, conflict ? 409 : 200, response.body);
      if (conflict) assert.equal(response.json().error, 'discord_username_conflict');
      assert.equal(h.account()?.username, conflict ? 'old_handle' : 'verified_handle');
      assert.equal(h.counts.updated, conflict ? 0 : 1);
    } finally { await h.app.close(); }
  }
});

test('provision rejects submitted usernames and mismatched authoritative provider identities before writes', async () => {
  const providerUsers: SupabaseUser[] = [
    { id: otherId, identities: [{ provider: 'discord', id: '123' }] },
    { id: userId, identities: [{ provider: 'discord', id: '999', identity_data: { sub: '123', provider_id: '123' } }] } as unknown as SupabaseUser,
    { id: userId, identities: [{ provider: 'github', id: '123' }] },
    { id: userId, identities: [] },
  ];
  for (const providerUser of providerUsers) {
    const h = harness({ providerUser });
    try {
      const response = await h.call({ providerToken: 'provider' });
      assert.equal(response.statusCode, 401, response.body); assert.equal(response.json().error, 'discord_identity_mismatch');
      assert.equal(h.counts.transactions, 0); assert.equal(h.counts.created, 0);
    } finally { await h.app.close(); }
  }
  const h = harness();
  try {
    for (const body of [{ username: 'forged' }, { providerToken: '' }, { providerToken: 42 }, { providerToken: 'provider', id: otherId }, []]) {
      const response = await h.call(body); assert.equal(response.statusCode, 400, response.body);
    }
    const nullEnvelope = await h.app.inject({ method: 'POST', url: '/api/users/me', payload: 'null', headers: { authorization: 'Bearer good', 'content-type': 'application/json' } });
    assert.equal(nullEnvelope.statusCode, 400);
    assert.equal(h.counts.profile, 0); assert.equal(h.counts.user, 0); assert.equal(h.counts.transactions, 0);
  } finally { await h.app.close(); }
});

test('admission failures stop before upstream calls or business effects', async () => {
  const h = harness({ limited: true });
  try {
    const response = await h.call({ providerToken: 'provider' });
    assert.equal(response.statusCode, 429, response.body);
    assert.equal(response.headers['retry-after'], '9');
    assert.equal(h.counts.profile, 0); assert.equal(h.counts.user, 0); assert.equal(h.counts.transactions, 0);
  } finally { await h.app.close(); }
});

test('expired bearer causes no effects and provision commits once after caller renews access', async () => {
  const h = harness();
  try {
    const denied = await h.call({ providerToken: 'provider' }, 'expired');
    assert.equal(denied.statusCode, 401); assert.equal(denied.json().error.code, 'access_expired');
    assert.deepEqual(h.counts, { profile: 0, user: 0, created: 0, updated: 0, transactions: 0, admissions: 0 });
    const accepted = await h.call({ providerToken: 'provider' });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(h.counts.created, 1); assert.equal(h.counts.transactions, 1);
  } finally { await h.app.close(); }
});
