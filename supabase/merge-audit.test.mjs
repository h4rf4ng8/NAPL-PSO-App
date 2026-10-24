import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountProblems, auditMerge, digest } from './merge-audit.mjs';
import { legacyTables, normalizeLegacy } from './merge-normalize.mjs';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const now = Date.parse('2026-10-23T12:00:00Z');
const stats = games => ({ games, wins: games, draws: 0, losses: 0, goals: games, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 });
const match = id => ({ id, date: now - 1000, season: 'S1', result: 'W', opponent: 'Blue', goals: 1, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0 });
const account = (id, username) => ({ id, username, position: 'ST', team_id: null, country: 'CA', stats: stats(0), matches: [], awards: [], championships: [], image_url: null, email: `${username.toLowerCase()}@example.test` });

function identity(id, username, providerId) {
  const metadata = { sub: providerId, provider_id: providerId, user_name: username, role: 'ignored-source-profile-key' };
  return {
    user: { id, instance_id: '00000000-0000-0000-0000-000000000000', role: 'authenticated', aud: 'authenticated',
      email: `${username.toLowerCase()}@example.test`, email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
      raw_app_meta_data: { provider: 'discord', providers: ['discord'] }, raw_user_meta_data: metadata, encrypted_password: 'old-password-value', recovery_token: 'old-recovery-value' },
    identity: { id, user_id: id, provider: 'discord', provider_id: providerId, identity_data: metadata, created_at: '2026-01-01T00:00:00Z' },
  };
}

function fixture() {
  const manifest = { account_aliases: {}, excluded_team_ids: [], excluded_vote_ids: [] };
  const legacy = Object.fromEntries(legacyTables.map(table => [table, []]));
  legacy.accounts.push(account(alice, 'Alice'));
  const existing = identity(alice, 'Alice', '111111111111111111');
  const source = { legacy: structuredClone(legacy), users: [structuredClone(existing.user)], identities: [structuredClone(existing.identity)] };
  const destination = { legacy, current: normalizeLegacy(legacy, manifest).tables, users: [existing.user], identities: [existing.identity] };
  return { source, destination, manifest };
}

function addBob(source) {
  source.legacy.accounts.push(account(bob, 'Bob'));
  const added = identity(bob, 'Bob', '222222222222222222');
  source.users.push(added.user);
  source.identities.push(added.identity);
  return added;
}

test('an unchanged source is a deterministic no-op and audit never mutates either snapshot', () => {
  const { source, destination, manifest } = fixture();
  const before = structuredClone({ source, destination, manifest });
  const plan = auditMerge(source, destination, manifest, now);
  assert.deepEqual(plan.operations, []);
  assert.deepEqual(plan.auth, []);
  assert.deepEqual(plan.findings, []);
  assert.deepEqual({ source, destination, manifest }, before);
  assert.equal(plan.sourceHash, digest(source));
  assert.deepEqual(auditMerge(source, destination, manifest, now), plan);
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
});

test('three-way fields merge source changes while retaining destination edits and reporting conflicts', () => {
  const { source, destination, manifest } = fixture();
  source.legacy.accounts[0].country = 'US';
  destination.current.accounts[0].steam_url = 'https://steamcommunity.com/id/current';
  let plan = auditMerge(source, destination, manifest, now);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].after.country, 'US');
  assert.equal(plan.operations[0].after.steam_url, destination.current.accounts[0].steam_url);
  assert.equal(plan.operations[0].before.country, 'CA');
  destination.current.accounts[0].country = 'GB';
  plan = auditMerge(source, destination, manifest, now);
  assert.deepEqual(plan.operations, []);
  assert.ok(plan.findings.some(row => row.reason === 'destination_conflict' && row.field === 'country'));
});

test('new verified Discord accounts import sanitized auth and no source authority or credentials', () => {
  const { source, destination, manifest } = fixture();
  addBob(source);
  source.legacy.accounts[1].privileged = true;
  source.legacy.accounts[1].image_url = 'http://unreviewed.example.test/image.png';
  const plan = auditMerge(source, destination, manifest, now);
  assert.equal(plan.auth.length, 1);
  assert.equal(plan.auth[0].user.id, bob);
  assert.equal(plan.auth[0].user.encrypted_password, '');
  assert.equal(plan.auth[0].user.recovery_token, '');
  assert.equal(plan.auth[0].user.raw_user_meta_data.role, undefined);
  assert.equal(plan.auth[0].identity.identity_data.role, undefined);
  assert.deepEqual(plan.auth[0].user.raw_app_meta_data, { provider: 'discord', providers: ['discord'] });
  const added = plan.operations.find(row => row.table === 'accounts' && row.key.id === bob);
  assert.equal(added.before, null);
  assert.equal(added.after.privileged, undefined);
  assert.equal(added.after.image_url, null);
  assert.ok(plan.findings.some(row => row.reason === 'unreviewed_url'));
});

test('a verified account brings its team, pending invitation, seasons and position request through normalization', () => {
  const { source, destination, manifest } = fixture();
  addBob(source);
  Object.assign(source.legacy.accounts[1], { team_id: 'new-team', matches: [match('first-match')], stats: stats(1) });
  source.legacy.teams.push({ id: 'new-team', name: 'New Team', tag: 'NEW', status: 'approved', lineup: {}, owner_username: 'Bob', seasons: [],
    pending_members: [{ username: 'Alice', status: 'pending' }] });
  source.legacy.settings.push({ key: 'current_season', value: 'S2' });
  source.legacy.position_change_requests.push({ id: '33333333-3333-4333-8333-333333333333', account_id: bob, username: 'Bob', from_pos: 'ST', to_pos: 'GK', status: 'pending' });
  const plan = auditMerge(source, destination, manifest, now);
  const rows = table => plan.operations.filter(row => row.table === table).map(row => row.after);
  assert.equal(plan.auth.length, 1);
  assert.equal(rows('accounts')[0].team_id, 'new-team');
  assert.equal(rows('teams')[0].owner_account_id, bob);
  assert.equal(rows('team_join_requests')[0].account_id, alice);
  assert.deepEqual(rows('seasons'), [{ id: 'S1' }, { id: 'S2' }]);
  assert.equal(rows('team_seasons').length, 2);
  assert.equal(rows('position_change_requests')[0].account_id, bob);
  assert.deepEqual(plan.findings, []);
});

test('identity collisions, privileged metadata and changed existing identity links are held', () => {
  const variants = {
    email_collision: (added, destination) => { added.user.email = destination.users[0].email; },
    authority_metadata: added => { added.user.raw_app_meta_data.roles = ['admin']; },
    provider_mismatch: added => { added.identity.identity_data.sub = '333333333333333333'; },
  };
  for (const [kind, change] of Object.entries(variants)) {
    const { source, destination, manifest } = fixture();
    const added = addBob(source);
    change(added, destination);
    const plan = auditMerge(source, destination, manifest, now);
    assert.deepEqual(plan.auth, [], kind);
    assert.equal(plan.operations.some(row => row.table === 'accounts' && row.key.id === bob), false, kind);
    assert.ok(plan.findings.length > 0, kind);
  }
  const { source, destination, manifest } = fixture();
  source.identities[0].provider_id = '333333333333333333';
  source.legacy.accounts[0].country = 'US';
  const plan = auditMerge(source, destination, manifest, now);
  assert.deepEqual(plan.operations, []);
  assert.ok(plan.findings.some(row => row.reason === 'changed_identity_link'));
});

test('identity and media changes require review while independent safe fields still merge', () => {
  const { source, destination, manifest } = fixture();
  Object.assign(source.legacy.accounts[0], { username: 'Renamed', image_url: 'https://cdn.discordapp.com/avatar.png', country: 'US' });
  const plan = auditMerge(source, destination, manifest, now);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].after.username, 'Alice');
  assert.equal(plan.operations[0].after.image_url, null);
  assert.equal(plan.operations[0].after.country, 'US');
  assert.deepEqual(new Set(plan.findings.map(row => row.field)), new Set(['image_url', 'username']));
});

test('test markers, executable content and reviewed exclusions never produce imported identities', () => {
  const variants = {
    marker: source => { source.legacy.accounts[1].username = '[pentest] Bob'; },
    script: source => { source.legacy.accounts[1].country = '<script>alert(1)</script>'; },
    excluded_team: (source, manifest) => {
      manifest.excluded_team_ids.push('excluded');
      source.legacy.accounts[1].team_id = 'excluded';
      source.legacy.teams.push({ id: 'excluded', owner_username: 'Bob', seasons: [], pending_members: [] });
    },
  };
  for (const [variant, change] of Object.entries(variants)) {
    const { source, destination, manifest } = fixture();
    addBob(source);
    change(source, manifest);
    const plan = auditMerge(source, destination, manifest, now);
    assert.deepEqual(plan.auth, [], variant);
    assert.deepEqual(plan.operations, [], variant);
    assert.ok(plan.findings.length > 0, variant);
  }
});

test('invalid nested match values and statistics are held without throwing', () => {
  for (const value of [null, [], 'invalid', { ...match('m1'), date: now + 1 }, { ...match('m1'), goals: -1 }]) {
    const { source, destination, manifest } = fixture();
    source.legacy.accounts[0].matches = [value];
    source.legacy.accounts[0].stats = stats(1);
    const plan = auditMerge(source, destination, manifest, now);
    assert.deepEqual(plan.operations, []);
    assert.ok(plan.findings.some(row => row.reason === 'invalid_match'));
  }
  const { source, destination, manifest } = fixture();
  source.legacy.accounts[0].stats.goals = -1;
  assert.ok(auditMerge(source, destination, manifest, now).findings.some(row => row.reason === 'invalid_stats'));
  assert.ok(accountProblems({ ...account(alice, 'Alice'), matches: [match('same'), match('same')], stats: stats(2) }, now).includes('duplicate_match_ids'));
});

test('historical total mismatches preserve the prior stats and history while allowing a safe profile update', () => {
  const { source, destination, manifest } = fixture();
  Object.assign(source.legacy.accounts[0], { stats: stats(12), country: 'US', position: 'unknown' });
  const plan = auditMerge(source, destination, manifest, now);
  assert.equal(plan.operations.length, 1);
  assert.deepEqual(plan.operations[0].after.stats, destination.current.accounts[0].stats);
  assert.deepEqual(plan.operations[0].after.matches, destination.current.accounts[0].matches);
  assert.equal(plan.operations[0].after.position, 'ST');
  assert.equal(plan.operations[0].after.country, 'US');
  assert.ok(plan.findings.some(row => row.reason === 'historical_totals_differ_from_matches'));
});

test('a destination history conflict also holds source stats so the pair cannot diverge', () => {
  const { source, destination, manifest } = fixture();
  Object.assign(destination.legacy.accounts[0], { stats: stats(1), matches: [match('m1')] });
  destination.current = normalizeLegacy(destination.legacy, manifest).tables;
  destination.current.accounts[0].matches[0].opponent = 'Corrected opponent';
  Object.assign(source.legacy.accounts[0], { stats: stats(2), matches: [match('m1'), match('m2')], country: 'US' });
  const plan = auditMerge(source, destination, manifest, now);
  const update = plan.operations.find(row => row.table === 'accounts');
  assert.equal(update.after.country, 'US');
  assert.deepEqual(update.after.matches, destination.current.accounts[0].matches);
  assert.deepEqual(update.after.stats, destination.current.accounts[0].stats);
  assert.ok(plan.findings.some(row => row.field === 'matches' && row.reason === 'stats_history_conflict'));
});
