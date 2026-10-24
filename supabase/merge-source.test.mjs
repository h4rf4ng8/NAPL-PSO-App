import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { digest } from './merge-audit.mjs';
import { legacyTables, tableKeys } from './merge-normalize.mjs';
import { connectRehearsal, seedRehearsal } from './merge-rehearse.mjs';
import { applyOperations, claimAttempt, snapshot, verifyAfter, writeRow } from './merge-source.mjs';

const accountId = '11111111-1111-4111-8111-111111111111';
const identityId = '22222222-2222-4222-8222-222222222222';
const manifest = { account_aliases: {}, excluded_team_ids: [], excluded_vote_ids: [] };
const emptyDestination = () => ({ legacy: Object.fromEntries(legacyTables.map(table => [table, []])),
  current: Object.fromEntries(Object.keys(tableKeys).map(table => [table, []])), users: [], identities: [], roles: [], security: [] });

test('verification rejects changes outside the reviewed application and identity plan', () => {
  const before = emptyDestination(), plan = { operations: [], auth: [] };
  verifyAfter(before, structuredClone(before), plan);
  for (const section of ['legacy', 'current', 'roles', 'security', 'users', 'identities']) {
    const after = structuredClone(before);
    if (section === 'legacy' || section === 'current') after[section].accounts.push({ id: accountId });
    else after[section].push({ id: accountId });
    assert.throws(() => verifyAfter(before, after, plan), undefined, section);
  }
});

test('rehearsal refuses remote endpoints before attempting a connection', async () => {
  await assert.rejects(connectRehearsal('postgresql://postgres:unused@db.example.com/postgres'), /localhost only/);
});

test('concurrent apply attempts claim a protected directory only once', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'napl-merge-claim-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const results = await Promise.allSettled([claimAttempt(directory, 'reviewed-plan'), claimAttempt(directory, 'reviewed-plan')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'EEXIST');
  const file = path.join(directory, 'attempt.json');
  const receipt = await readFile(file, 'utf8');
  const fileStat = await stat(file);
  assert.equal(JSON.parse(receipt).planHash, 'reviewed-plan');
  assert.equal(fileStat.mode & 0o777, 0o600);
  await assert.rejects(claimAttempt(directory, 'another-plan'), { code: 'EEXIST' });
  assert.equal(await readFile(file, 'utf8'), receipt);
});

test('previous backups and commit receipts are preserved before another apply can start', async context => {
  for (const name of ['backups.json', 'source-before.dump', 'destination-before.dump', 'destination-committed.json']) {
    const directory = await mkdtemp(path.join(tmpdir(), 'napl-merge-backup-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const sentinel = path.join(directory, name);
    await writeFile(sentinel, 'original rollback evidence', { mode: 0o600 });
    await assert.rejects(claimAttempt(directory, 'another-plan'), /previous apply attempt/);
    assert.equal(await readFile(sentinel, 'utf8'), 'original rollback evidence');
    await assert.rejects(stat(path.join(directory, 'attempt.json')), { code: 'ENOENT' });
  }
});

test('PostgreSQL merge applies JSON, identities and circular team references; a failed batch rolls back', {
  skip: !process.env.MERGE_TEST_DATABASE_URL,
}, async () => {
  const client = await connectRehearsal(process.env.MERGE_TEST_DATABASE_URL);
  try {
    await client.query('BEGIN');
    await seedRehearsal(client, emptyDestination(), manifest);
    const before = await snapshot(client, true);
    const plan = { auth: [{ user: { id: accountId, aud: 'authenticated', role: 'authenticated', raw_app_meta_data: { provider: 'discord', providers: ['discord'] }, raw_user_meta_data: { sub: '123456789012345678' } },
      identity: { id: identityId, user_id: accountId, provider: 'discord', provider_id: '123456789012345678', identity_data: { sub: '123456789012345678' } } }], operations: [
      { table: 'accounts', before: null, after: { id: accountId, username: 'player', position: 'ST', team_id: 'team', stats: { games: 1, goals: 2 }, matches: [{ id: 'match', season: 'S1' }] } },
      { table: 'teams', before: null, after: { id: 'team', name: 'Team', tag: 'TM', owner_account_id: accountId, lineup: { ST1: 'player' } } },
      { table: 'seasons', before: null, after: { id: 'S1' } },
      { table: 'team_seasons', before: null, after: { team_id: 'team', season_id: 'S1' } },
      { table: 'settings', before: null, after: { key: 'position_weights', value: JSON.stringify({ ST: { goalsPerGame: 1 } }) } },
    ] };
    await client.query('SAVEPOINT failed_batch');
    const invalid = structuredClone(plan);
    invalid.operations.push({ table: 'news', before: null, after: { id: 'bad', type: 'result', home_team_id: 'missing' } });
    await assert.rejects(applyOperations(client, invalid), error => error.code === '23503');
    await client.query('ROLLBACK TO SAVEPOINT failed_batch');
    assert.equal(digest(await snapshot(client, true)), digest(before));
    await applyOperations(client, plan);
    const after = await snapshot(client, true);
    verifyAfter(before, after, plan);
    assert.equal(after.current.accounts[0].team_id, 'team');
    assert.deepEqual(after.current.accounts[0].matches, [{ id: 'match', season: 'S1' }]);
    await writeRow(client, 'asl', 'accounts', { id: accountId, stats: { games: 2, goals: 3 } }, true);
    const updated = await client.query('SELECT stats FROM asl.accounts WHERE id=$1', [accountId]);
    assert.deepEqual(updated.rows[0].stats, { games: 2, goals: 3 });
    await assert.rejects(seedRehearsal(client, emptyDestination(), manifest), /empty disposable database/);
  } finally {
    try { await client.query('ROLLBACK'); } finally { await client.end(); }
  }
});
