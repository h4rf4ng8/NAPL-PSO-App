import { readFields } from '../responses.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../helper.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';
import { DEFAULT_POSITION_WEIGHTS } from '../../routes/accounts/ranking.js';

const alice = '11111111-1111-4111-8111-111111111111';
const admin = '33333333-3333-4333-8333-333333333333';
const verify = async (id: string) => ({ id, sessionId: id, claims: { sub: id } });

test('settings retain nullable text defaults and championship changes roll back with account awards', {
  skip: !process.env.API_TEST_DATABASE_URL || !process.env.API_TEST_ADMIN_DATABASE_URL,
}, async () => {
  const db = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const owner = connectDatabase(process.env.API_TEST_ADMIN_DATABASE_URL!);
  const app = createApp({ db, verify });
  const teamId = `settings-${randomUUID()}`;
  const pendingCaptain = randomUUID();
  const nextSeason = `next-${teamId}`, excludedSeason = `excluded-${teamId}`;
  const keys = ['current_season', 'season_champions', 'position_weights'];
  const saved = await owner.client.setting.findMany({ where: { key: { in: keys } } });
  const accounts = await owner.client.account.findMany({ select: { id: true, team_id: true, championships: true } });
  const aliceWasAdmin = await owner.client.userRole.findUnique({ where: { user_id_role: { user_id: alice, role: 'admin' } } });
  const call = (key: string, value: unknown, user = admin) => app.inject({ method: 'PUT', url: `/api/settings/${key}`, headers: { authorization: `Bearer ${user}` }, payload: { value } });
  try {
    await owner.client.setting.deleteMany({ where: { key: { in: keys } } });
    await owner.client.setting.createMany({ data: keys.map(key => ({ key, value: null })) });
    const currentSeason = await app.inject('/api/settings/current_season');
    assert.equal(currentSeason.statusCode, 200, currentSeason.body);
    assert.equal(currentSeason.body, 'S1');
    assert.deepEqual(await readFields(app, '/api/settings/season_champions'), {});
    assert.deepEqual(await readFields(app, '/api/settings/position_weights'), DEFAULT_POSITION_WEIGHTS);
    await owner.client.setting.update({ where: { key: 'position_weights' }, data: { value: '{broken' } });
    assert.equal((await app.inject('/api/settings/position_weights')).statusCode, 503);
    await owner.client.userRole.createMany({ data: [{ user_id: alice, role: 'admin' }], skipDuplicates: true });
    assert.equal((await call('position_weights', {}, alice)).statusCode, 403);
    const season = await call('current_season', 'S-query');
    assert.equal(season.statusCode, 200, season.body);
    assert.equal((await owner.client.setting.findUnique({ where: { key: 'current_season' } }))?.value, 'S-query');

    await owner.client.team.create({ data: { id: teamId, name: teamId, tag: 'TST', owner_account_id: alice, status: 'approved' } });
    await owner.client.account.update({ where: { id: alice }, data: { team_id: teamId } });
    await owner.client.team.create({ data: { id: `${teamId}-opponent`, name: 'Opponent', tag: 'OPP', owner_account_id: admin, status: 'approved' } });
    await owner.execute(Prisma.sql`INSERT INTO auth.users(id) VALUES(${pendingCaptain}::uuid)`);
    await owner.client.account.create({ data: { id: pendingCaptain, username: `pending_${pendingCaptain}`, strikers_id: pendingCaptain } });
    await owner.client.team.create({ data: { id: `${teamId}-pending`, name: 'Pending', tag: 'PEN', owner_account_id: pendingCaptain, status: 'pending' } });
    const schedule = await app.inject({ method: 'POST', url: '/api/schedule', headers: { authorization: `Bearer ${admin}` }, payload: {
      id: teamId, season: nextSeason, week: 1, homeTeamId: teamId, awayTeamId: `${teamId}-opponent`,
    } });
    assert.equal(schedule.statusCode, 200, schedule.body);
    assert.equal(await owner.client.teamSeason.count({ where: { team_id: teamId, season_id: nextSeason } }), 1);
    assert.equal(await owner.client.teamSeason.count({ where: { team_id: `${teamId}-pending`, season_id: nextSeason } }), 1);
    const approved = await app.inject({ method: 'POST', url: `/api/teams/${teamId}-pending/review`, headers: { authorization: `Bearer ${admin}` }, payload: { status: 'approved' } });
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal(await owner.client.teamSeason.count({ where: { team_id: `${teamId}-pending`, season_id: nextSeason } }), 1);
    assert.equal((await call('current_season', nextSeason)).statusCode, 200);
    assert.equal(await owner.client.teamSeason.count({ where: { team_id: teamId, season_id: nextSeason } }), 1);
    const exclusion = await app.inject({ method: 'PATCH', url: `/api/teams/${teamId}`, headers: { authorization: `Bearer ${admin}` }, payload: { seasons: [excludedSeason] } });
    assert.equal(exclusion.statusCode, 200, exclusion.body);
    assert.deepEqual(exclusion.json(), { ok: true, id:teamId });
    assert.equal((await call('current_season', excludedSeason)).statusCode, 200);
    assert.equal(await owner.client.teamSeason.count({ where: { team_id: teamId, season_id: excludedSeason } }), 0);
    const champions = { 'S-query': { winnerTeamId: teamId, runnerUpTeamId: null, setAt: 1234 } };
    const created = await call('season_champions', champions);
    assert.equal(created.statusCode, 200, created.body);
    const account = await owner.client.account.findUniqueOrThrow({ where: { id: alice } });
    assert.ok(Array.isArray(account.championships));
    assert.ok(account.championships.some(award => typeof award === 'object' && award !== null && !Array.isArray(award) && award.teamId === teamId));
    const same = await call('season_champions', { 'S-query': { winnerTeamId: teamId, runnerUpTeamId: teamId, setAt: 5678 } });
    assert.equal(same.statusCode, 400, same.body);
    assert.deepEqual(await readFields(app, '/api/settings/season_champions'), champions);
    const missing = await call('season_champions', { 'S-query': { winnerTeamId: 'missing-settings-team', runnerUpTeamId: null, setAt: 5678 } });
    assert.equal(missing.statusCode, 404, missing.body);
    assert.deepEqual((await owner.client.account.findUniqueOrThrow({ where: { id: alice } })).championships, account.championships);

    await owner.execute(Prisma.sql `ALTER TABLE asl.settings ADD CONSTRAINT settings_queries_reject CHECK (key <> 'season_champions') NOT VALID`);
    try {
      const failed = await call('season_champions', {});
      assert.equal(failed.statusCode, 400, failed.body);
      assert.deepEqual((await owner.client.account.findUniqueOrThrow({ where: { id: alice } })).championships, account.championships);
      assert.deepEqual(await readFields(app, '/api/settings/season_champions'), champions);
    } finally { await owner.execute(Prisma.sql `ALTER TABLE asl.settings DROP CONSTRAINT settings_queries_reject`); }
    assert.equal((await call('season_champions', {})).statusCode, 200);
    assert.equal(JSON.stringify((await owner.client.account.findUniqueOrThrow({ where: { id: alice } })).championships).includes(teamId), false);
  } finally {
    await owner.execute(Prisma.sql `ALTER TABLE asl.settings DROP CONSTRAINT IF EXISTS settings_queries_reject`);
    await owner.client.setting.deleteMany({ where: { key: { in: keys } } });
    if (saved.length > 0) await owner.client.setting.createMany({ data: saved });
    for (const account of accounts) await owner.client.account.update({ where: { id: account.id }, data: { team_id: account.team_id, championships: account.championships === null ? Prisma.JsonNull : account.championships } });
    await owner.client.scheduledMatch.deleteMany({ where: { id: teamId } });
    await owner.client.transfer.deleteMany({ where: { to_team_id: `${teamId}-pending` } });
    await owner.client.team.deleteMany({ where: { id: { in: [teamId, `${teamId}-opponent`, `${teamId}-pending`] } } });
    await owner.execute(Prisma.sql`DELETE FROM auth.users WHERE id=${pendingCaptain}::uuid`);
    await owner.client.teamSeason.deleteMany({ where: { season_id: { in: [nextSeason, excludedSeason] } } });
    await owner.client.season.deleteMany({ where: { id: { in: [nextSeason, excludedSeason] } } });
    if (!aliceWasAdmin) await owner.client.userRole.deleteMany({ where: { user_id: alice, role: 'admin' } });
    await app.close(); await db.close(); await owner.close();
  }
});
