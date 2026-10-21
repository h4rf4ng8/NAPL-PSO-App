import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InjectOptions } from 'fastify';
import { createApp } from '../helper.js';
import { connectDatabase } from '../../plugins/db/client.js';

test('content mutations preserve ordering, literal identifiers, defaults and rollback', {
  skip: !process.env.API_TEST_DATABASE_URL,
}, async t => {
  const db = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const admin = '33333333-3333-4333-8333-333333333333';
  const app = createApp({ db, verify: async id => ({ id, sessionId: id, claims: { sub: id } }) });
  const prefix = 'content_queries_';
  const call = (method: InjectOptions['method'], url: string, payload?: object) => app.inject({
    method, url, headers: { authorization: `Bearer ${admin}` }, ...(payload !== undefined && { payload }),
  });
  const ok = async (method: InjectOptions['method'], url: string, payload?: object) => {
    const response = await call(method, url, payload);
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };
  const schedule = { week: 1, homeTeamId: `${prefix}home`, awayTeamId: `${prefix}away` };
  try {
    await db.client.team.createMany({ data: [{ id: `${prefix}home`, name: 'Content Home', tag: 'CH', owner_account_id: admin }, { id: `${prefix}away`, name: 'Content Away', tag: 'CA', owner_account_id: admin }] });
    await t.test('foreign keys reject invalid content references and same-team matches', async () => {
      assert.equal((await call('POST', '/api/news', { id: `${prefix}invalid_news`, type: 'result', homeTeamId: `${prefix}missing_team` })).statusCode, 409);
      assert.equal((await call('POST', '/api/schedule', { ...schedule, id: `${prefix}invalid_schedule`, season: 'S1', awayTeamId: schedule.homeTeamId })).statusCode, 400);
      assert.equal((await call('POST', '/api/transfers', { id: `${prefix}invalid_transfer`, season: 'S1', playerUsername: `${prefix}missing_player`, kind: 'signing' })).statusCode, 409);
      assert.equal(await db.client.news.count({ where: { id: `${prefix}invalid_news` } }), 0);
    });

    await t.test('reordering is atomic and repeated rule IDs take their last index', async () => {
      const first = `${prefix}rule' OR '1'='1`, second = `${prefix}rule_second`;
      await ok('POST', '/api/rules', { id: first, title: 'First', sortOrder: 7 });
      await ok('POST', '/api/rules', { id: second, title: 'Second', sortOrder: 8 });
      assert.equal((await call('PUT', '/api/rules/order', { ids: [first, `${prefix}missing`] })).statusCode, 404);
      const before = await db.client.ruleSection.findMany({ where: { id: { in: [first, second] } }, orderBy: { sort_order: 'asc' } });
      assert.deepEqual(before.map(row => row.sort_order), [7, 8]);
      await ok('PUT', '/api/rules/order', { ids: [first, second, first] });
      const rules = (await ok('GET', '/api/rules')).filter((row: { id: string }) => [first, second].includes(row.id));
      assert.deepEqual(rules.map((row: { id: string; sortOrder: number }) => [row.id, row.sortOrder]), [[second, 1], [first, 2]]);
    });

    await t.test('bulk duplicate IDs return each intermediate write and keep optional fields', async () => {
      const id = `${prefix}bulk' OR '1'='1`, season = `${prefix}season'; DELETE FROM asl.news; --`;
      const matches = await ok('POST', '/api/schedule/bulk', { matches: [
        { ...schedule, id, season, notes: 'kept', scheduledDate: 1_700_000_000_000 },
        { ...schedule, id, season, week: 2, scheduledDate: null },
      ] });
      assert.deepEqual(matches.map((row: { week: number }) => row.week), [1, 2]);
      assert.equal(matches[0].scheduledDate, 1_700_000_000_000);
      assert.equal(matches[1].scheduledDate, null);
      assert.equal(matches[1].notes, 'kept');
      assert.equal(matches[1].updatedAt, matches[0].updatedAt);
      assert.equal(matches[1].matchType, 'regular');
      assert.equal(matches[1].status, 'scheduled');
      assert.deepEqual(await ok('GET', `/api/schedule?season=${encodeURIComponent(season)}`), [matches[1]]);
      await ok('POST', '/api/schedule', { ...schedule, id: `${prefix}other`, season: `${prefix}other` });
      await ok('DELETE', `/api/schedule/season/${encodeURIComponent(season)}`);
      assert.equal((await ok('GET', `/api/schedule?season=${encodeURIComponent(season)}`)).length, 0);
      assert.equal((await ok('GET', `/api/schedule?season=${prefix}other`)).length, 1);
    });

    await t.test('season replacement rolls back deletion and partial inserts on repeated IDs', async () => {
      const season = `${prefix}replace'; --`, original = `${prefix}original`, duplicate = `${prefix}duplicate`;
      await ok('POST', '/api/schedule', { ...schedule, id: original, season });
      const url = `/api/schedule/season/${encodeURIComponent(season)}`;
      assert.equal((await call('PUT', url, { matches: [
        { ...schedule, id: duplicate }, { ...schedule, id: duplicate, week: 2 },
      ] })).statusCode, 409);
      const rows = await ok('GET', `/api/schedule?season=${encodeURIComponent(season)}`);
      assert.deepEqual(rows.map((row: { id: string }) => row.id), [original]);
      assert.equal(await db.client.scheduledMatch.count({ where: { id: duplicate } }), 0);
    });

    await t.test('empty patches, missing rows, deletes, author replacement and null dates remain distinct', async () => {
      for (const resource of ['news', 'rules', 'articles', 'schedule', 'transfers']) {
        const payload = resource === 'transfers' ? { windowType: null } : {};
        assert.equal((await call('PATCH', `/api/${resource}/${prefix}missing`, payload)).statusCode, 404);
        assert.deepEqual(await ok('DELETE', `/api/${resource}/${prefix}missing`), { ok: true });
      }
      assert.equal(await ok('GET', `/api/articles/slug/${prefix}missing`), null);
      const id = `${prefix}news' OR '1'='1`;
      const saved = await ok('POST', '/api/news', { id, type: 'announcement', title: null, body: '', date: 1_700_000_000_000 });
      assert.equal(saved.title, '');
      assert.equal(saved.body, '');
      assert.equal(saved.notes, '');
      assert.equal(saved.pinned, false);
      await db.client.news.update({ where: { id }, data: { author: 'Original' } });
      const patched = await ok('PATCH', `/api/news/${encodeURIComponent(id)}`, { date: null });
      assert.equal(patched.author, 'Original');
      assert.equal(patched.date, null);
      assert.deepEqual(await ok('PATCH', `/api/news/${encodeURIComponent(id)}`, {}), patched);
      assert.equal((await ok('POST', '/api/news', { id, type: 'announcement' })).author, 'Admin');
      assert.equal(await db.client.news.count({ where: { id } }), 1);
      const ruleId = `${prefix}empty_rule`;
      await ok('POST', '/api/rules', { id: ruleId, title: 'Rule', body: 'Body', sortOrder: 9 });
      await db.client.ruleSection.update({ where: { id: ruleId }, data: { updated_at: new Date(0) } });
      const rule = await ok('PATCH', `/api/rules/${ruleId}`, {});
      assert.ok(rule.updatedAt > 0);
      assert.equal(rule.title, 'Rule');
      assert.equal(rule.body, '');
      assert.equal(rule.sortOrder, 0);
    });

    await t.test('transfers preserve literal season filters and author fields', async () => {
      const id = `${prefix}transfer' OR '1'='1`, season = `${prefix}transfer'; --`;
      const input = { id, season, playerUsername: 'Admin', kind: 'signing' };
      const saved = await ok('POST', '/api/transfers', input);
      assert.equal(saved.createdBy, 'Admin');
      assert.equal(saved.windowType, null);
      await db.client.transfer.update({ where: { id }, data: { created_by: 'Original' } });
      const patched = await ok('PATCH', `/api/transfers/${encodeURIComponent(id)}`, { windowType: 'cross_league' });
      assert.equal(patched.createdBy, 'Admin');
      assert.deepEqual(await ok('GET', `/api/transfers?season=${encodeURIComponent(season)}`), [patched]);
      const replaced = await ok('POST', '/api/transfers', input);
      assert.equal(replaced.createdBy, 'Admin');
      assert.equal(replaced.windowType, 'cross_league');
      assert.equal(replaced.createdAt, saved.createdAt);
    });
  } finally {
    await Promise.all([
      db.client.news.deleteMany({ where: { id: { startsWith: prefix } } }),
      db.client.ruleSection.deleteMany({ where: { id: { startsWith: prefix } } }),
      db.client.scheduledMatch.deleteMany({ where: { id: { startsWith: prefix } } }),
      db.client.transfer.deleteMany({ where: { id: { startsWith: prefix } } }),
    ]);
    await db.client.team.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.client.teamSeason.deleteMany({ where: { season_id: { startsWith: prefix } } });
    await db.client.season.deleteMany({ where: { id: { startsWith: prefix } } });
    await app.close();
    await db.close();
  }
});
