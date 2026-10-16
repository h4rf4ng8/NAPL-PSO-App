import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createApp } from '../helper.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';

const path = (id: string) => `/api/submissions/${encodeURIComponent(id)}`;

test('submission HTTP filtering preserves exact names, literal IDs and review state', {
  skip: !process.env.API_TEST_DATABASE_URL,
}, async () => {
  assert.ok(process.env.API_TEST_ADMIN_DATABASE_URL);
  const db = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const owner = connectDatabase(process.env.API_TEST_ADMIN_DATABASE_URL);
  const app = createApp({ db, verify: async id => ({ id, sessionId: id, claims: { sub: id } }) });
  const playerId = randomUUID(), name = `Sub' OR true -- ${playerId.slice(0, 8)}`;
  const prefix = `submission_queries_${playerId}_`, literalId = `${prefix}' OR true --`;
  const admin = '33333333-3333-4333-8333-333333333333';
  const input = { matchInfo: { homeTeamId: 'home', awayTeamId: 'away', homeScore: 2, awayScore: 0, date: 1_700_000_000_000, season: 'S1', extra: { retained: null } }, playerStats: [{ username: 'Player', position: 'ST' }], edits: [{ note: '' }] };
  const call = (method: 'GET' | 'PATCH' | 'DELETE', path: string, actor: string, payload?: object) => app.inject({ method, url: path, payload, headers: { authorization: `Bearer ${actor}` } });
  try {
    await owner.execute(Prisma.sql`INSERT INTO auth.users(id) VALUES(${playerId}::uuid)`);
    await owner.execute(Prisma.sql`INSERT INTO auth.sessions(id,user_id) VALUES(${playerId}::uuid,${playerId}::uuid)`);
    await owner.execute(Prisma.sql`INSERT INTO auth_gateway.memberships(user_id,discord_user_id,eligible,valid_until) VALUES(${playerId}::uuid,'submission-test',true,now()+interval '1 hour')`);
    await db.client.account.create({ data: { id: playerId, username: name, username_lower: name.toLowerCase() } });
    await db.client.submission.createMany({ data: [
      { id: literalId, submitted_by: name, match_info: {}, status: 'pending' },
      { id: `${prefix}rejected`, submitted_by: name, match_info: {}, status: 'rejected' },
      { id: `${prefix}approved`, submitted_by: name, match_info: {}, status: 'approved' },
      { id: `${prefix}case_variant`, submitted_by: name.toUpperCase(), match_info: {} },
      { id: `${prefix}other`, submitted_by: 'Another Player', match_info: {} },
    ] });
    const listed = await call('GET', '/api/submissions', playerId);
    assert.equal(listed.statusCode, 200, listed.body);
    assert.deepEqual(listed.json<Array<{ id: string }>>().map(row => row.id).toSorted((a, b) => a.localeCompare(b)), [literalId, `${prefix}rejected`, `${prefix}approved`].toSorted((a, b) => a.localeCompare(b)));
    const all = await call('GET', '/api/submissions', admin);
    assert.equal(all.json<Array<{ id: string }>>().filter(row => row.id.startsWith(prefix)).length, 5);
    const denied = await call('PATCH', path(literalId), playerId, input);
    assert.equal(denied.statusCode, 403, denied.body);
    assert.deepEqual((await db.client.submission.findUniqueOrThrow({ where: { id: literalId } })).match_info, {});
    const edited = await call('PATCH', path(literalId), admin, input);
    assert.equal(edited.statusCode, 200, edited.body);
    assert.equal(edited.json().id, literalId);
    assert.deepEqual(edited.json().matchInfo, input.matchInfo);
    assert.deepEqual(edited.json().edits, input.edits);
    assert.deepEqual(Object.keys(edited.json()).toSorted((a, b) => a.localeCompare(b)), ['id', 'matchInfo', 'playerStats', 'edits', 'status', 'submittedBy', 'submittedAt', 'reviewedBy', 'reviewedAt', 'rejectionReason'].toSorted((a, b) => a.localeCompare(b)));
    assert.equal(await db.client.submission.count({ where: { id: { startsWith: prefix } } }), 5);
    assert.equal((await call('PATCH', path(`${prefix}rejected`), admin, input)).statusCode, 409);
    assert.equal((await call('PATCH', path(`${prefix}approved`), admin, input)).statusCode, 409);
    assert.equal((await call('DELETE', path(`${prefix}approved`), admin)).statusCode, 409);
    assert.equal((await call('PATCH', path(`${prefix}missing' OR true --`), admin, input)).statusCode, 404);
    assert.equal((await call('DELETE', path(`${prefix}missing`), admin)).statusCode, 404);
    assert.equal((await db.client.submission.findUniqueOrThrow({ where: { id: `${prefix}approved` } })).status, 'approved');
  } finally {
    try {
    await db.client.submission.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.client.account.deleteMany({ where: { id: playerId } });
    await owner.execute(Prisma.sql`DELETE FROM auth.sessions WHERE user_id=${playerId}::uuid`);
    await owner.execute(Prisma.sql`DELETE FROM auth.users WHERE id=${playerId}::uuid`);
    } finally {
      await Promise.all([app.close(), db.close(), owner.close()]);
    }
  }
});
